/**
 * Anomaly Detector — User Scoped (UUID)
 *
 * Computes rolling averages per category for a specific user and flags months where
 * spending exceeds the configurable threshold.
 * Redis cache keys use userId UUID (not email).
 */

const Redis = require('ioredis');
const config = require('../config');
const { queryAsUser } = require('../db/pool');

const CACHE_TTL = 90000;

/**
 * Detect anomalies in spending by category for a user.
 * @param {string} userId - UUID
 */
async function detectAnomalies(userId) {
  if (!userId) return [];
  console.log(`[Anomaly] Starting anomaly detection for user ${userId}...`);

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    lazyConnect: true,
  });
  await redis.connect();

  try {
    const currentMonth = new Date().toISOString().substring(0, 7);

    // Get current month's spend by category
    const { rows: currentSpend } = await queryAsUser(userId, `
      SELECT
        COALESCE(co.category, t.category) AS effective_category,
        SUM(t.amount) AS current_amount
      FROM transactions t
      LEFT JOIN category_overrides co
        ON co.transaction_id = t.id
       AND co.user_id = t.user_id
      WHERE t.user_id = $1
        AND t.transaction_type = 'debit'
        AND TO_CHAR(t.transaction_date, 'YYYY-MM') = $2
      GROUP BY COALESCE(co.category, t.category)
    `, [userId, currentMonth]);

    // Get rolling average (last N months, excluding current)
    const { rows: rollingAvg } = await queryAsUser(userId, `
      SELECT
        effective_category,
        AVG(monthly_total) AS avg_amount
      FROM (
        SELECT
          COALESCE(co.category, t.category) AS effective_category,
          TO_CHAR(t.transaction_date, 'YYYY-MM') AS month,
          SUM(t.amount) AS monthly_total
        FROM transactions t
        LEFT JOIN category_overrides co
          ON co.transaction_id = t.id
         AND co.user_id = t.user_id
        WHERE t.user_id = $1
          AND t.transaction_type = 'debit'
          AND t.transaction_date >= NOW() - INTERVAL '${config.anomaly.rollingMonths + 1} months'
          AND TO_CHAR(t.transaction_date, 'YYYY-MM') != $2
        GROUP BY COALESCE(co.category, t.category), TO_CHAR(t.transaction_date, 'YYYY-MM')
      ) AS monthly_totals
      GROUP BY effective_category
    `, [userId, currentMonth]);

    const avgMap = {};
    for (const row of rollingAvg) {
      avgMap[row.effective_category] = parseFloat(row.avg_amount);
    }

    const anomalies = [];
    for (const row of currentSpend) {
      const current = parseFloat(row.current_amount);
      const avg = avgMap[row.effective_category];

      if (!avg || avg === 0) continue;

      const ratio = current / avg;

      if (ratio >= config.anomaly.thresholdMultiplier) {
        const pctOver = Math.round((ratio - 1) * 100);
        anomalies.push({
          category: row.effective_category,
          current_amount: current,
          average_amount: Math.round(avg * 100) / 100,
          pct_over: pctOver,
          severity: pctOver > 100 ? 'high' : pctOver > 60 ? 'medium' : 'low',
        });
      }
    }

    anomalies.sort((a, b) => b.pct_over - a.pct_over);

    await redis.setex(
      `dashboard:${userId}:anomalies:${currentMonth}`,
      CACHE_TTL,
      JSON.stringify(anomalies)
    );

    console.log(
      `[Anomaly] Detection complete for user ${userId}. ${anomalies.length} anomalies found`
    );

    return anomalies;
  } finally {
    await redis.quit();
  }
}

module.exports = { detectAnomalies };
