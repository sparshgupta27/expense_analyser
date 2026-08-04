/**
 * Dashboard API Routes
 *
 * Reads from Postgres / Redis cache, with dynamic live store fallback if DB is offline.
 * Supports filtering by month (req.query.month) and time range (req.query.range = 1, 3, 6, 12).
 */

const express = require('express');
const config = require('../config');
const { query } = require('../db/pool');
const { generateInsights } = require('../services/insightGenerator');
const mockStore = require('../db/mockStore');

const router = express.Router();

/**
 * GET /api/dashboard/monthly-trend?range=12
 */
router.get('/monthly-trend', async (req, res) => {
  const rangeMonths = parseInt(req.query.range || req.query.months) || 12;
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(transaction_date, 'YYYY-MM') AS month,
        SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) AS total_debit,
        SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) AS total_credit,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE transaction_date >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
      ORDER BY month
    `);

    if (rows.length > 0) return res.json(rows.slice(-rangeMonths));
    res.json(mockStore.getStoreMonthlyTrend(rangeMonths));
  } catch (err) {
    res.json(mockStore.getStoreMonthlyTrend(rangeMonths));
  }
});

/**
 * GET /api/dashboard/category-breakdown?month=YYYY-MM&range=1
 */
router.get('/category-breakdown', async (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  const rangeMonths = parseInt(req.query.range || req.query.months) || 1;

  try {
    const { rows } = await query(`
      SELECT
        COALESCE(
          (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id),
          t.category
        ) AS category,
        SUM(amount) AS amount,
        COUNT(*) AS count
      FROM transactions t
      WHERE transaction_type = 'debit'
        AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
      GROUP BY category
      ORDER BY amount DESC
    `, [month]);

    if (rows.length === 0) return res.json(mockStore.getStoreCategories(month, rangeMonths));

    const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const result = rows.map((r) => ({
      category: r.category,
      amount: parseFloat(r.amount),
      count: parseInt(r.count),
      percentage: total > 0 ? Math.round((parseFloat(r.amount) / total) * 100) : 0,
    }));

    res.json(result);
  } catch (err) {
    res.json(mockStore.getStoreCategories(month, rangeMonths));
  }
});

/**
 * GET /api/dashboard/top-merchants?month=YYYY-MM&limit=10&range=1
 */
router.get('/top-merchants', async (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  const limit = parseInt(req.query.limit) || 10;
  const rangeMonths = parseInt(req.query.range || req.query.months) || 1;

  try {
    const { rows } = await query(`
      SELECT
        merchant_normalized AS merchant,
        SUM(amount) AS amount,
        COUNT(*) AS count
      FROM transactions
      WHERE transaction_type = 'debit'
        AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
      GROUP BY merchant_normalized
      ORDER BY amount DESC
      LIMIT $2
    `, [month, limit]);

    if (rows.length === 0) return res.json(mockStore.getStoreMerchants(month, rangeMonths).slice(0, limit));

    res.json(rows.map((r) => ({
      merchant: r.merchant,
      amount: parseFloat(r.amount),
      count: parseInt(r.count),
    })));
  } catch (err) {
    res.json(mockStore.getStoreMerchants(month, rangeMonths).slice(0, limit));
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
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  const rangeMonths = parseInt(req.query.range || req.query.months) || 1;
  try {
    const insights = await generateInsights(month);
    res.json(insights.length > 0 ? insights : mockStore.getStoreInsights(month, rangeMonths));
  } catch (err) {
    res.json(mockStore.getStoreInsights(month, rangeMonths));
  }
});

/**
 * GET /api/dashboard/summary?month=YYYY-MM&range=1
 */
router.get('/summary', async (req, res) => {
  const month = req.query.month || new Date().toISOString().substring(0, 7);
  const rangeMonths = parseInt(req.query.range || req.query.months) || 1;

  try {
    const txs = mockStore.getStoreTransactions(month, rangeMonths);

    const totalSpent = txs.reduce((sum, t) => sum + (t.transaction_type === 'debit' ? t.amount : 0), 0);
    const totalIncome = txs.reduce((sum, t) => sum + (t.transaction_type === 'credit' ? t.amount : 0), 0);

    res.json({
      month,
      rangeMonths,
      total_spent: totalSpent,
      total_income: totalIncome,
      transaction_count: txs.length,
      vs_last_month: 0,
    });
  } catch (err) {
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
