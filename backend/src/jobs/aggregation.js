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

/**
 * Aggregate monthly spend trends (last 12 months).
 */
async function aggregateMonthlyTrend(redis) {
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

  await redis.setex('dashboard:monthly-trend', CACHE_TTL, JSON.stringify(rows));
  console.log(`[Aggregation] Monthly trend: ${rows.length} months cached`);
  return rows;
}

/**
 * Aggregate category breakdown for a given month.
 */
async function aggregateCategoryBreakdown(redis) {
  // Get the last 3 months for comparison
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
    WHERE transaction_type = 'debit'
      AND transaction_date >= NOW() - INTERVAL '3 months'
    GROUP BY TO_CHAR(transaction_date, 'YYYY-MM'), effective_category
    ORDER BY month DESC, total_amount DESC
  `);

  // Group by month
  const byMonth = {};
  for (const row of rows) {
    if (!byMonth[row.month]) byMonth[row.month] = [];
    byMonth[row.month].push({
      category: row.effective_category,
      amount: parseFloat(row.total_amount),
      count: parseInt(row.count),
    });
  }

  // Add percentage within each month
  for (const [month, categories] of Object.entries(byMonth)) {
    const total = categories.reduce((s, c) => s + c.amount, 0);
    for (const cat of categories) {
      cat.percentage = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
    }
    await redis.setex(`dashboard:categories:${month}`, CACHE_TTL, JSON.stringify(categories));
  }

  console.log(`[Aggregation] Category breakdown: ${Object.keys(byMonth).length} months cached`);
  return byMonth;
}

/**
 * Aggregate top merchants.
 */
async function aggregateTopMerchants(redis) {
  const { rows } = await query(`
    SELECT
      TO_CHAR(transaction_date, 'YYYY-MM') AS month,
      merchant_normalized,
      SUM(amount) AS total_amount,
      COUNT(*) AS count
    FROM transactions
    WHERE transaction_type = 'debit'
      AND transaction_date >= NOW() - INTERVAL '3 months'
    GROUP BY TO_CHAR(transaction_date, 'YYYY-MM'), merchant_normalized
    ORDER BY month DESC, total_amount DESC
  `);

  const byMonth = {};
  for (const row of rows) {
    if (!byMonth[row.month]) byMonth[row.month] = [];
    byMonth[row.month].push({
      merchant: row.merchant_normalized,
      amount: parseFloat(row.total_amount),
      count: parseInt(row.count),
    });
  }

  // Keep top 10 per month
  for (const [month, merchants] of Object.entries(byMonth)) {
    const top10 = merchants.slice(0, 10);
    await redis.setex(`dashboard:merchants:${month}`, CACHE_TTL, JSON.stringify(top10));
  }

  console.log(`[Aggregation] Top merchants: ${Object.keys(byMonth).length} months cached`);
  return byMonth;
}

/**
 * Run all aggregation tasks.
 */
async function runAggregation() {
  console.log('[Aggregation] Starting nightly aggregation...');
  const redis = await getRedis();
  await redis.connect();

  try {
    await aggregateMonthlyTrend(redis);
    await aggregateCategoryBreakdown(redis);
    await aggregateTopMerchants(redis);
    console.log('[Aggregation] Complete');
  } finally {
    await redis.quit();
  }
}

module.exports = { runAggregation };
