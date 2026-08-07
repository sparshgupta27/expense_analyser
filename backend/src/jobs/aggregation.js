/**
 * Aggregation Job — Nightly
 *
 * Precomputes dashboard aggregates from the transactions table
 * and stores them in Redis for fast dashboard reads.
 * Runs at 3 AM daily.
 */

const Redis = require('ioredis');
const config = require('../config');
const { query } = require('../db/pool');

const CACHE_TTL = 90000; // 25 hours in seconds

async function getRedis() {
  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true,
  });
}

async function aggregateUserMonthlyTrend(redis, userEmail) {
  const { rows } = await query(`
    SELECT
      TO_CHAR(transaction_date, 'YYYY-MM') AS month,
      SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) AS total_debit,
      SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE 0 END) AS total_credit,
      COUNT(*) AS transaction_count
    FROM transactions
    WHERE user_email = $1
      AND transaction_date >= NOW() - INTERVAL '12 months'
    GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
    ORDER BY month
  `, [userEmail]);

  await redis.setex(`dashboard:${userEmail}:monthly-trend`, CACHE_TTL, JSON.stringify(rows));
  return rows;
}

async function aggregateUserCategoryBreakdown(redis, userEmail) {
  const { rows } = await query(`
    SELECT
      TO_CHAR(transaction_date, 'YYYY-MM') AS month,
      COALESCE(
        (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id),
        t.category
      ) AS effective_category,
      SUM(amount) AS total_amount,
      COUNT(*) AS count
    FROM transactions t
    WHERE user_email = $1
      AND transaction_type = 'debit'
      AND transaction_date >= NOW() - INTERVAL '3 months'
    GROUP BY TO_CHAR(transaction_date, 'YYYY-MM'), effective_category
    ORDER BY month DESC, total_amount DESC
  `, [userEmail]);

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
    await redis.setex(`dashboard:${userEmail}:categories:${month}`, CACHE_TTL, JSON.stringify(categories));
  }

  return byMonth;
}

async function aggregateUserTopMerchants(redis, userEmail) {
  const { rows } = await query(`
    SELECT
      TO_CHAR(transaction_date, 'YYYY-MM') AS month,
      merchant_normalized,
      SUM(amount) AS total_amount,
      COUNT(*) AS count
    FROM transactions
    WHERE user_email = $1
      AND transaction_type = 'debit'
      AND transaction_date >= NOW() - INTERVAL '3 months'
    GROUP BY TO_CHAR(transaction_date, 'YYYY-MM'), merchant_normalized
    ORDER BY month DESC, total_amount DESC
  `, [userEmail]);

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
    await redis.setex(`dashboard:${userEmail}:merchants:${month}`, CACHE_TTL, JSON.stringify(top10));
  }

  return byMonth;
}

/**
 * Run all aggregation tasks per user.
 */
async function runAggregation() {
  console.log('[Aggregation] Starting nightly aggregation...');
  const redis = await getRedis();
  await redis.connect();

  try {
    const { rows: users } = await query('SELECT DISTINCT user_email FROM transactions WHERE user_email IS NOT NULL');
    for (const userRow of users) {
      const userEmail = userRow.user_email;
      console.log(`[Aggregation] Running aggregation for user ${userEmail}...`);
      await aggregateUserMonthlyTrend(redis, userEmail);
      await aggregateUserCategoryBreakdown(redis, userEmail);
      await aggregateUserTopMerchants(redis, userEmail);
    }
    console.log('[Aggregation] Complete for all users');
  } finally {
    await redis.quit();
  }
}

module.exports = { runAggregation };

