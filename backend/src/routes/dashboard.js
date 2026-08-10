/**
 * Dashboard API Routes
 *
 * Reads from Postgres scoped strictly by req.user.id (UUID).
 * Uses queryAsUser() so Postgres RLS provides a second layer of defense.
 */

const express = require('express');
const { queryAsUser } = require('../db/pool');
const { generateInsights } = require('../services/insightGenerator');

const router = express.Router();

/**
 * GET /api/dashboard/monthly-trend?range=12
 */
router.get('/monthly-trend', async (req, res) => {
  const { id: userId } = req.user;
  const rangeMonths = parseInt(req.query.range || req.query.months) || 12;
  try {
    const { rows } = await queryAsUser(userId, `
      SELECT
        TO_CHAR(transaction_date, 'YYYY-MM') AS month,
        SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) AS total_debit,
        SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) AS total_credit,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE user_id = $1
        AND transaction_date >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
      ORDER BY month
    `, [userId]);

    res.json(rows.slice(-rangeMonths));
  } catch (err) {
    console.error('[Dashboard] monthly-trend error:', err.message);
    res.json([]);
  }
});

/**
 * GET /api/dashboard/category-breakdown?month=YYYY-MM&range=1
 */
router.get('/category-breakdown', async (req, res) => {
  const { id: userId } = req.user;
  const month = req.query.month || new Date().toISOString().substring(0, 7);

  try {
    const { rows } = await queryAsUser(userId, `
      SELECT
        COALESCE(
          (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id AND co.user_id = $1),
          t.category
        ) AS category,
        SUM(amount) AS amount,
        COUNT(*) AS count
      FROM transactions t
      WHERE t.user_id = $1
        AND t.transaction_type = 'debit'
        AND TO_CHAR(t.transaction_date, 'YYYY-MM') = $2
      GROUP BY category
      ORDER BY amount DESC
    `, [userId, month]);

    const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const result = rows.map((r) => ({
      category: r.category,
      amount: parseFloat(r.amount),
      count: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseFloat(r.amount) / total) * 100) : 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('[Dashboard] category-breakdown error:', err.message);
    res.json([]);
  }
});

/**
 * GET /api/dashboard/top-merchants?month=YYYY-MM&limit=10&range=1
 */
router.get('/top-merchants', async (req, res) => {
  const { id: userId } = req.user;
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  const limit = parseInt(req.query.limit) || 10;

  try {
    const { rows } = await queryAsUser(userId, `
      SELECT
        merchant_normalized AS merchant,
        SUM(amount) AS amount,
        COUNT(*) AS count
      FROM transactions
      WHERE user_id = $1
        AND transaction_type = 'debit'
        AND TO_CHAR(transaction_date, 'YYYY-MM') = $2
      GROUP BY merchant_normalized
      ORDER BY amount DESC
      LIMIT $3
    `, [userId, month, limit]);

    res.json(rows.map((r) => ({
      merchant: r.merchant,
      amount: parseFloat(r.amount),
      count: parseInt(r.count),
    })));
  } catch (err) {
    console.error('[Dashboard] top-merchants error:', err.message);
    res.json([]);
  }
});

/**
 * GET /api/dashboard/anomalies?month=YYYY-MM
 */
router.get('/anomalies', async (req, res) => {
  res.json([]);
});

/**
 * GET /api/dashboard/insights?month=YYYY-MM&range=1
 */
router.get('/insights', async (req, res) => {
  const { id: userId, email: userEmail } = req.user;
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  try {
    const insights = await generateInsights(month, userEmail, userId);
    res.json(insights);
  } catch (err) {
    console.error('[Dashboard] insights error:', err.message);
    res.json([]);
  }
});

/**
 * GET /api/dashboard/summary?month=YYYY-MM&range=1
 */
router.get('/summary', async (req, res) => {
  const { id: userId } = req.user;
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  const rangeMonths = parseInt(req.query.range || req.query.months) || 1;

  try {
    const { rows } = await queryAsUser(userId, `
      SELECT
        SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) AS total_spent,
        SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) AS total_income,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE user_id = $1
        AND transaction_date >= TO_DATE($2, 'YYYY-MM') - (($3::int - 1) * INTERVAL '1 month')
        AND transaction_date <  TO_DATE($2, 'YYYY-MM') + INTERVAL '1 month'
    `, [userId, month, rangeMonths]);

    const row = rows[0];
    res.json({
      month,
      rangeMonths,
      total_spent: parseFloat(row?.total_spent || 0),
      total_income: parseFloat(row?.total_income || 0),
      transaction_count: parseInt(row?.transaction_count || 0, 10),
      vs_last_month: 0,
    });
  } catch (err) {
    console.error('[Dashboard] summary error:', err.message);
    res.json({
      month,
      rangeMonths,
      total_spent: 0,
      total_income: 0,
      transaction_count: 0,
      vs_last_month: 0,
    });
  }
});

module.exports = router;
