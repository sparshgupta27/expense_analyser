/**
 * Aggregation Job — Nightly / User-Scoped (UUID)
 *
 * Precomputes dashboard aggregates from the transactions table
 * and stores them in Redis for fast dashboard reads.
 * Cache keys use userId UUID (not email) for clean scoping.
 */

const Redis = require('ioredis');
const config = require('../config');
const { queryAsUser } = require('../db/pool');

const CACHE_TTL = 90000; // 25 hours in seconds

async function getRedis() {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true,
  });
}

/**
 * Aggregate monthly spend trends (last 12 months) for a user.
 * @param {object} redis
 * @param {string} userId - UUID
 */
async function aggregateMonthlyTrend(redis, userId) {
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

  await redis.setex(`dashboard:${userId}:monthly-trend`, CACHE_TTL, JSON.stringify(rows));
  console.log(`[Aggregation] Monthly trend for user ${userId}: ${rows.length} months cached`);
  return rows;
}

/**
 * Aggregate category breakdown for a user.
 * @param {object} redis
 * @param {string} userId - UUID
 */
async function aggregateCategoryBreakdown(redis, userId) {
  const { rows } = await queryAsUser(userId, `
    SELECT
      TO_CHAR(t.transaction_date, 'YYYY-MM') AS month,
      COALESCE(co.category, t.category) AS effective_category,
      SUM(t.amount) AS total_amount,
      COUNT(*) AS count
    FROM transactions t
    LEFT JOIN category_overrides co
      ON co.transaction_id = t.id
     AND co.user_id = t.user_id
    WHERE t.user_id = $1
      AND t.transaction_type = 'debit'
      AND t.transaction_date >= NOW() - INTERVAL '3 months'
    GROUP BY TO_CHAR(t.transaction_date, 'YYYY-MM'), COALESCE(co.category, t.category)
    ORDER BY month DESC, total_amount DESC
  `, [userId]);

  const byMonth = {};
  for (const row of rows) {
    if (!byMonth[row.month]) byMonth[row.month] = [];
    byMonth[row.month].push({
      category: row.effective_category,
      amount: parseFloat(row.total_amount),
      count: parseInt(row.count),
    });
  }

  for (const [month, categories] of Object.entries(byMonth)) {
    const total = categories.reduce((s, c) => s + c.amount, 0);
    for (const cat of categories) {
      cat.percentage = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
    }
    await redis.setex(`dashboard:${userId}:categories:${month}`, CACHE_TTL, JSON.stringify(categories));
  }

  console.log(`[Aggregation] Category breakdown for user ${userId}: ${Object.keys(byMonth).length} months cached`);
  return byMonth;
}

/**
 * Aggregate top merchants for a user.
 * @param {object} redis
 * @param {string} userId - UUID
 */
async function aggregateTopMerchants(redis, userId) {
  const { rows } = await queryAsUser(userId, `
    SELECT
      TO_CHAR(transaction_date, 'YYYY-MM') AS month,
      merchant_normalized,
      SUM(amount) AS total_amount,
      COUNT(*) AS count
    FROM transactions
    WHERE user_id = $1
      AND transaction_type = 'debit'
      AND transaction_date >= NOW() - INTERVAL '3 months'
    GROUP BY TO_CHAR(transaction_date, 'YYYY-MM'), merchant_normalized
    ORDER BY month DESC, total_amount DESC
  `, [userId]);

  const byMonth = {};
  for (const row of rows) {
    if (!byMonth[row.month]) byMonth[row.month] = [];
    byMonth[row.month].push({
      merchant: row.merchant_normalized,
      amount: parseFloat(row.total_amount),
      count: parseInt(row.count),
    });
  }

  for (const [month, merchants] of Object.entries(byMonth)) {
    const top10 = merchants.slice(0, 10);
    await redis.setex(`dashboard:${userId}:merchants:${month}`, CACHE_TTL, JSON.stringify(top10));
  }

  console.log(`[Aggregation] Top merchants for user ${userId}: ${Object.keys(byMonth).length} months cached`);
  return byMonth;
}

/**
 * Run all aggregation tasks for a user.
 * @param {string} userId - UUID
 */
async function runAggregation(userId) {
  if (!userId) return;
  console.log(`[Aggregation] Starting aggregation for user ${userId}...`);
  const redis = await getRedis();
  await redis.connect();

  try {
    await aggregateMonthlyTrend(redis, userId);
    await aggregateCategoryBreakdown(redis, userId);
    await aggregateTopMerchants(redis, userId);
    console.log(`[Aggregation] Complete for user ${userId}`);
  } finally {
    await redis.quit();
  }
}

module.exports = { runAggregation };
