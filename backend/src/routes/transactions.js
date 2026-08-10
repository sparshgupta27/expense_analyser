/**
 * Transactions API Routes — User Scoped
 */

const express = require('express');
const { query } = require('../db/pool');
const { setOverride } = require('../services/categorizer');

const router = express.Router();

const VALID_CATEGORIES = [
  'Food', 'Shopping', 'Bills', 'Transport',
  'Entertainment', 'Subscriptions', 'Other',
];

/**
 * GET /api/transactions
 * Paginated, filterable transaction list.
 */
router.get('/', async (req, res) => {
  try {
    const userEmail = req.userEmail;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE t.user_email = $1';
    const params = [userEmail];
    let paramIndex = 2;

    // Category filter
    if (req.query.category) {
      whereClause += ` AND COALESCE(
        (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id AND co.user_email = $1),
        t.category
      ) = $${paramIndex}`;
      params.push(req.query.category);
      paramIndex++;
    }

    // Search filter (merchant name)
    if (req.query.search) {
      whereClause += ` AND (t.merchant_normalized ILIKE $${paramIndex} OR t.merchant_raw ILIKE $${paramIndex})`;
      params.push(`%${req.query.search}%`);
      paramIndex++;
    }

    // Date range
    if (req.query.start_date) {
      whereClause += ` AND t.transaction_date >= $${paramIndex}`;
      params.push(req.query.start_date);
      paramIndex++;
    }
    if (req.query.end_date) {
      whereClause += ` AND t.transaction_date <= $${paramIndex}`;
      params.push(req.query.end_date);
      paramIndex++;
    }

    // Transaction type
    if (req.query.type) {
      whereClause += ` AND t.transaction_type = $${paramIndex}`;
      params.push(req.query.type);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM transactions t ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    const dataParams = [...params, limit, offset];
    const { rows } = await query(`
      SELECT
        t.id,
        t.gmail_message_id,
        t.amount,
        t.merchant_raw,
        t.merchant_normalized,
        COALESCE(
          (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id AND co.user_email = $1),
          t.category
        ) AS category,
        t.transaction_type,
        t.transaction_date,
        t.parse_confidence,
        t.created_at,
        (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id AND co.user_email = $1) IS NOT NULL AS has_override
      FROM transactions t
      ${whereClause}
      ORDER BY t.transaction_date DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, dataParams);

    res.json({
      data: rows.map((r) => ({
        ...r,
        amount: parseFloat(r.amount),
        parse_confidence: parseFloat(r.parse_confidence),
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[Transactions] GET error:', err.message);
    res.json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
    });
  }
});

/**
 * PATCH /api/transactions/:id/category
 * Set a manual category override.
 */
router.patch('/:id/category', async (req, res) => {
  try {
    const userEmail = req.userEmail;
    const { id } = req.params;
    const { category } = req.body;

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    // Verify transaction exists & belongs to user
    const txn = await query('SELECT id FROM transactions WHERE id = $1 AND user_email = $2', [id, userEmail]);
    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await setOverride(id, category, userEmail);

    res.json({ message: 'Category updated', transaction_id: id, category });
  } catch (err) {
    console.error('[Transactions] Category update error:', err.message);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

/**
 * GET /api/transactions/:id
 * Get a single transaction with its original email.
 */
router.get('/:id', async (req, res) => {
  try {
    const userEmail = req.userEmail;
    const { id } = req.params;

    const { rows } = await query(`
      SELECT
        t.*,
        COALESCE(
          (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id AND co.user_email = $2),
          t.category
        ) AS effective_category,
        re.sender AS email_sender,
        re.subject AS email_subject,
        re.body AS email_body,
        re.received_at AS email_received_at
      FROM transactions t
      LEFT JOIN raw_emails re ON re.gmail_message_id = t.gmail_message_id AND re.user_email = t.user_email
      WHERE t.id = $1 AND t.user_email = $2
    `, [id, userEmail]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[Transactions] Get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

module.exports = router;
