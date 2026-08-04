/**
 * Insight Generator
 *
 * Generates natural-language insight strings from transaction data.
 * Pure template logic — no LLM call needed.
 */

const { query } = require('../db/pool');

/**
 * Generate insights for the current/specified month.
 * @param {string} month - YYYY-MM format
 * @returns {Promise<Array<{type: string, icon: string, message: string}>>}
 */
async function generateInsights(month) {
  const insights = [];

  // 1. Biggest expense this month
  const { rows: biggest } = await query(`
    SELECT merchant_normalized, amount, transaction_date
    FROM transactions
    WHERE transaction_type = 'debit'
      AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
    ORDER BY amount DESC
    LIMIT 1
  `, [month]);

  if (biggest.length > 0) {
    const b = biggest[0];
    const dateStr = new Date(b.transaction_date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
    insights.push({
      type: 'biggest_expense',
      icon: '💰',
      message: `Biggest expense: ₹${Number(b.amount).toLocaleString('en-IN')} at ${b.merchant_normalized} on ${dateStr}`,
    });
  }

  // 2. Month-over-month category comparison
  const prevMonth = getPreviousMonth(month);
  const { rows: categoryComparison } = await query(`
    SELECT
      curr.category,
      curr.total AS current_total,
      COALESCE(prev.total, 0) AS prev_total
    FROM (
      SELECT category, SUM(amount) AS total
      FROM transactions
      WHERE transaction_type = 'debit' AND TO_CHAR(transaction_date, 'YYYY-MM') = $1
      GROUP BY category
    ) curr
    LEFT JOIN (
      SELECT category, SUM(amount) AS total
      FROM transactions
      WHERE transaction_type = 'debit' AND TO_CHAR(transaction_date, 'YYYY-MM') = $2
      GROUP BY category
    ) prev ON curr.category = prev.category
    WHERE COALESCE(prev.total, 0) > 0
    ORDER BY ABS(curr.total - COALESCE(prev.total, 0)) DESC
    LIMIT 3
  `, [month, prevMonth]);

  for (const row of categoryComparison) {
    const curr = parseFloat(row.current_total);
    const prev = parseFloat(row.prev_total);
    if (prev === 0) continue;

    const change = ((curr - prev) / prev) * 100;
    const absChange = Math.abs(Math.round(change));

    if (absChange < 10) continue; // Skip small changes

    if (change > 0) {
      insights.push({
        type: 'category_increase',
        icon: '📈',
        message: `${row.category} spending up ${absChange}% vs last month`,
      });
    } else {
      insights.push({
        type: 'category_decrease',
        icon: '📉',
        message: `${row.category} spending down ${absChange}% vs last month`,
      });
    }
  }

  // 3. Subscription renewals this month
  const { rows: renewals } = await query(`
    SELECT s.merchant_normalized, s.current_amount, s.previous_amount,
           s.price_change_flag, s.last_charged_date
    FROM subscriptions s
    WHERE TO_CHAR(s.last_charged_date, 'YYYY-MM') = $1
  `, [month]);

  for (const renewal of renewals) {
    const dateStr = new Date(renewal.last_charged_date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });

    if (renewal.price_change_flag) {
      insights.push({
        type: 'subscription_price_change',
        icon: '⚠️',
        message: `${renewal.merchant_normalized} renewed on ${dateStr} — price changed from ₹${Number(renewal.previous_amount).toLocaleString('en-IN')} to ₹${Number(renewal.current_amount).toLocaleString('en-IN')}`,
      });
    } else {
      insights.push({
        type: 'subscription_renewal',
        icon: '🔄',
        message: `${renewal.merchant_normalized} renewed on ${dateStr} — ₹${Number(renewal.current_amount).toLocaleString('en-IN')}`,
      });
    }
  }

  // 4. New subscriptions detected
  const { rows: newSubs } = await query(`
    SELECT merchant_normalized, current_amount, interval_days
    FROM subscriptions
    WHERE TO_CHAR(created_at, 'YYYY-MM') = $1
  `, [month]);

  for (const sub of newSubs) {
    const intervalLabel =
      sub.interval_days <= 7 ? 'weekly' :
      sub.interval_days <= 31 ? 'monthly' :
      sub.interval_days <= 92 ? 'quarterly' : 'yearly';

    insights.push({
      type: 'new_subscription',
      icon: '🆕',
      message: `New subscription detected: ${sub.merchant_normalized} (₹${Number(sub.current_amount).toLocaleString('en-IN')}/${intervalLabel})`,
    });
  }

  // 5. Total spend summary
  const { rows: totalRow } = await query(`
    SELECT
      SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE 0 END) AS total_debit,
      COUNT(*) AS txn_count
    FROM transactions
    WHERE TO_CHAR(transaction_date, 'YYYY-MM') = $1
  `, [month]);

  if (totalRow.length > 0 && totalRow[0].total_debit > 0) {
    const total = parseFloat(totalRow[0].total_debit);
    const count = parseInt(totalRow[0].txn_count);
    const avgTxn = Math.round(total / count);

    insights.push({
      type: 'summary',
      icon: '📊',
      message: `${count} transactions this month, averaging ₹${avgTxn.toLocaleString('en-IN')} per transaction`,
    });
  }

  // 6. Ghost subscription warning
  const { rows: ghosts } = await query(`
    SELECT merchant_normalized, current_amount
    FROM subscriptions
    WHERE ghost_flag = true
  `);

  for (const ghost of ghosts) {
    insights.push({
      type: 'ghost_subscription',
      icon: '👻',
      message: `${ghost.merchant_normalized} (₹${Number(ghost.current_amount).toLocaleString('en-IN')}/cycle) — you may be paying for a service you don't use`,
    });
  }

  return insights;
}

/**
 * Get previous month string in YYYY-MM format.
 */
function getPreviousMonth(month) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 2, 1); // month is 0-indexed, so m-2 = previous month
  return date.toISOString().substring(0, 7);
}

module.exports = { generateInsights };
