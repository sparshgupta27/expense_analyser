/**
 * Anomaly Detector — Nightly Job
 *
 * Computes rolling averages per category and flags months where
 * spending exceeds the configurable threshold (default: 40% above average).
 * Runs as part of the nightly aggregation pipeline.
 */

const Redis = require('ioredis');
const config = require('../config');
const { query } = require('../db/pool');

const CACHE_TTL = 90000; // 25 hours

/**
 * Detect anomalies in spending by category.
 */
async function detectAnomalies() {
  console.log('[Anomaly] Starting per-user anomaly detection...');

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true,
  });
  await redis.connect();

  try {
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const { rows: users } = await query('SELECT DISTINCT user_email FROM transactions WHERE user_email IS NOT NULL');

    const allAnomalies = {};

    for (const userRow of users) {
      const userEmail = userRow.user_email;

      // Get current month's spend by category for user
      const { rows: currentSpend } = await query(`
        SELECT
          COALESCE(
            (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id),
            t.category
          ) AS effective_category,
          SUM(amount) AS current_amount
        FROM transactions t
        WHERE user_email = $1
          AND transaction_type = 'debit'
          AND TO_CHAR(transaction_date, 'YYYY-MM') = $2
        GROUP BY effective_category
      `, [userEmail, currentMonth]);

      // Get rolling average per user
      const { rows: rollingAvg } = await query(`
        SELECT
          effective_category,
          AVG(monthly_total) AS avg_amount
        FROM (
          SELECT
            COALESCE(
              (SELECT co.category FROM category_overrides co WHERE co.transaction_id = t.id),
              t.category
            ) AS effective_category,
            TO_CHAR(transaction_date, 'YYYY-MM') AS month,
            SUM(amount) AS monthly_total
          FROM transactions t
          WHERE user_email = $1
            AND transaction_type = 'debit'
            AND transaction_date >= NOW() - INTERVAL '${config.anomaly.rollingMonths + 1} months'
            AND TO_CHAR(transaction_date, 'YYYY-MM') != $2
          GROUP BY effective_category, TO_CHAR(transaction_date, 'YYYY-MM')
        ) AS monthly_totals
        GROUP BY effective_category
      `, [userEmail, currentMonth]);

      const avgMap = {};
      for (const row of rollingAvg) {
        avgMap[row.effective_category] = parseFloat(row.avg_amount);
      }

      const userAnomalies = [];
      for (const row of currentSpend) {
        const current = parseFloat(row.current_amount);
        const avg = avgMap[row.effective_category];

        if (!avg || avg === 0) continue;

        const ratio = current / avg;

        if (ratio >= config.anomaly.thresholdMultiplier) {
          const pctOver = Math.round((ratio - 1) * 100);
          userAnomalies.push({
            category: row.effective_category,
            current_amount: current,
            average_amount: Math.round(avg * 100) / 100,
            pct_over: pctOver,
            severity: pctOver > 100 ? 'high' : pctOver > 60 ? 'medium' : 'low',
            user_email: userEmail,
          });
        }
      }

      userAnomalies.sort((a, b) => b.pct_over - a.pct_over);

      await redis.setex(
        `dashboard:${userEmail}:anomalies:${currentMonth}`,
        CACHE_TTL,
        JSON.stringify(userAnomalies)
      );

      allAnomalies[userEmail] = userAnomalies;
    }

    console.log('[Anomaly] Detection complete for all users');
    return allAnomalies;
  } finally {
    await redis.quit();
  }
}

module.exports = { detectAnomalies };

