/**
 * Subscriptions API Routes — User Scoped
 */

const express = require('express');
const { query } = require('../db/pool');

const router = express.Router();

/**
 * GET /api/subscriptions
 * List all detected subscriptions with flags for the current user.
 */
router.get('/', async (req, res) => {
  try {
    const userEmail = req.userEmail;
    const { rows } = await query(`
      SELECT
        s.id,
        s.merchant_normalized,
        mp.display_name,
        s.current_amount,
        s.previous_amount,
        s.interval_days,
        s.next_expected_date,
        s.last_charged_date,
        s.price_change_flag,
        s.ghost_flag,
        s.confidence,
        s.last_detected_at,
        CASE
          WHEN s.interval_days <= 7 THEN 'weekly'
          WHEN s.interval_days <= 31 THEN 'monthly'
          WHEN s.interval_days <= 92 THEN 'quarterly'
          ELSE 'yearly'
        END AS frequency
      FROM subscriptions s
      LEFT JOIN merchant_profiles mp ON mp.normalized_name = s.merchant_normalized AND mp.user_email = s.user_email
      WHERE s.user_email = $1
      ORDER BY s.next_expected_date ASC
    `, [userEmail]);

    // Split into active, upcoming, ghost
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const upcoming = rows.filter(
      (r) => new Date(r.next_expected_date) <= sevenDaysFromNow && !r.ghost_flag
    );
    const ghosts = rows.filter((r) => r.ghost_flag);
    const active = rows.filter((r) => !r.ghost_flag);

    // Calculate monthly total
    const monthlyTotal = active.reduce((sum, sub) => {
      const monthlyAmount = sub.interval_days <= 7
        ? sub.current_amount * 4
        : sub.interval_days <= 31
        ? sub.current_amount
        : sub.interval_days <= 92
        ? sub.current_amount / 3
        : sub.current_amount / 12;
      return sum + parseFloat(monthlyAmount);
    }, 0);

    res.json({
      subscriptions: rows.map((r) => ({
        ...r,
        current_amount: parseFloat(r.current_amount),
        previous_amount: r.previous_amount ? parseFloat(r.previous_amount) : null,
        confidence: parseFloat(r.confidence),
      })),
      summary: {
        total_subscriptions: active.length,
        monthly_total: Math.round(monthlyTotal * 100) / 100,
        upcoming_renewals: upcoming.length,
        ghost_subscriptions: ghosts.length,
        price_changes: rows.filter((r) => r.price_change_flag).length,
      },
    });
  } catch (err) {
    console.error('[Subscriptions] GET error:', err.message);
    res.json({
      subscriptions: [],
      summary: {
        total_subscriptions: 0,
        monthly_total: 0,
        upcoming_renewals: 0,
        ghost_subscriptions: 0,
        price_changes: 0,
      },
    });
  }
});

/**
 * GET /api/subscriptions/upcoming
 * Renewals in the next 7 days.
 */
router.get('/upcoming', async (req, res) => {
  try {
    const userEmail = req.userEmail;
    const { rows } = await query(`
      SELECT
        s.merchant_normalized,
        mp.display_name,
        s.current_amount,
        s.next_expected_date,
        s.interval_days,
        CASE
          WHEN s.interval_days <= 7 THEN 'weekly'
          WHEN s.interval_days <= 31 THEN 'monthly'
          ELSE 'yearly'
        END AS frequency
      FROM subscriptions s
      LEFT JOIN merchant_profiles mp ON mp.normalized_name = s.merchant_normalized AND mp.user_email = s.user_email
      WHERE s.user_email = $1
        AND s.next_expected_date <= NOW() + INTERVAL '7 days'
        AND s.ghost_flag = false
      ORDER BY s.next_expected_date ASC
    `, [userEmail]);

    res.json(rows.map((r) => ({
      ...r,
      current_amount: parseFloat(r.current_amount),
      days_until: Math.ceil(
        (new Date(r.next_expected_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
    })));
  } catch (err) {
    console.error('[Subscriptions] Upcoming error:', err.message);
    res.status(500).json({ error: 'Failed to fetch upcoming renewals' });
  }
});

module.exports = router;
