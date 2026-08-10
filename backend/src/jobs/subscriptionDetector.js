/**
 * Subscription Detector — User Scoped (UUID)
 *
 * Groups transactions by normalized merchant, looks for recurring
 * amounts at regular intervals. Detects ghost subscriptions for a user.
 */

const config = require('../config');
const { queryAsUser } = require('../db/pool');

const {
  amountTolerance,
  dayTolerance,
  minOccurrences,
  ghostInactiveDays,
} = config.subscription;

/**
 * Check if two amounts are within tolerance (±5%).
 */
function amountsMatch(a, b) {
  if (a === 0 || b === 0) return false;
  const diff = Math.abs(a - b) / Math.max(a, b);
  return diff <= amountTolerance;
}

/**
 * Check if an interval matches a known subscription period (±3 days).
 */
function matchesInterval(intervalDays) {
  const knownIntervals = [7, 14, 28, 30, 31, 90, 365];
  let bestMatch = null;
  let minDiff = Infinity;

  for (const known of knownIntervals) {
    const diff = Math.abs(intervalDays - known);
    if (diff <= dayTolerance && diff < minDiff) {
      minDiff = diff;
      bestMatch = known;
    }
  }
  return bestMatch;
}

/**
 * Detect subscriptions from transaction history for a user.
 * @param {string} userId - UUID
 */
async function detectSubscriptions(userId) {
  if (!userId) return { detected: 0, ghostCount: 0 };
  console.log(`[Subscription] Starting detection for user ${userId}...`);

  // Get all merchants with 2+ debit transactions for this user
  const { rows: merchants } = await queryAsUser(userId, `
    SELECT
      merchant_normalized,
      ARRAY_AGG(amount ORDER BY transaction_date) AS amounts,
      ARRAY_AGG(transaction_date ORDER BY transaction_date) AS dates,
      COUNT(*) AS txn_count
    FROM transactions
    WHERE user_id = $1
      AND transaction_type = 'debit'
      AND merchant_normalized IS NOT NULL
    GROUP BY merchant_normalized
    HAVING COUNT(*) >= $2
    ORDER BY merchant_normalized
  `, [userId, minOccurrences]);

  let detected = 0;
  let ghostCount = 0;

  for (const merchant of merchants) {
    const amounts = merchant.amounts.map(Number);
    const dates = merchant.dates.map((d) => new Date(d));

    const recentAmounts = amounts.slice(-5);
    const referenceAmount = recentAmounts[recentAmounts.length - 1];

    const consistentAmounts = recentAmounts.filter((a) =>
      amountsMatch(a, referenceAmount)
    );

    if (consistentAmounts.length < minOccurrences) continue;

    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const diffMs = dates[i].getTime() - dates[i - 1].getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    const recentIntervals = intervals.slice(-4);
    let matchedInterval = null;

    for (const interval of recentIntervals) {
      const match = matchesInterval(interval);
      if (match) {
        matchedInterval = match;
        break;
      }
    }

    if (!matchedInterval) continue;

    const lastDate = dates[dates.length - 1];
    const currentAmount = amounts[amounts.length - 1];
    const previousAmount = amounts.length >= 2 ? amounts[amounts.length - 2] : currentAmount;
    const priceChanged = !amountsMatch(currentAmount, previousAmount);

    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + matchedInterval);

    const intervalConsistency = recentIntervals.filter(
      (i) => matchesInterval(i) === matchedInterval
    ).length / recentIntervals.length;
    const confidence = Math.min(
      1.0,
      (consistentAmounts.length / recentAmounts.length) * intervalConsistency
    );

    // Upsert subscription scoped by (user_id, merchant_normalized)
    await queryAsUser(userId,
      `INSERT INTO subscriptions
         (user_id, merchant_normalized, current_amount, previous_amount, interval_days,
          next_expected_date, last_charged_date, price_change_flag, confidence, last_detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (user_id, merchant_normalized) DO UPDATE SET
         current_amount     = $3,
         previous_amount    = $4,
         interval_days      = $5,
         next_expected_date = $6,
         last_charged_date  = $7,
         price_change_flag  = $8,
         confidence         = $9,
         last_detected_at   = NOW()`,
      [
        userId,
        merchant.merchant_normalized,
        currentAmount,
        previousAmount,
        matchedInterval,
        nextDate,
        lastDate,
        priceChanged,
        confidence,
      ]
    );

    // Update merchant_profiles scoped to this user
    await queryAsUser(userId,
      `UPDATE merchant_profiles SET is_subscription = true
       WHERE user_id = $1 AND normalized_name = $2`,
      [userId, merchant.merchant_normalized]
    );

    detected++;
  }

  // Ghost detection — scoped to user
  const { rows: subs } = await queryAsUser(userId,
    'SELECT merchant_normalized FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  for (const sub of subs) {
    const { rows: recentActivity } = await queryAsUser(userId,
      `SELECT COUNT(*) AS count FROM transactions
       WHERE user_id = $1
         AND merchant_normalized = $2
         AND transaction_date >= NOW() - INTERVAL '${ghostInactiveDays} days'
         AND transaction_type = 'debit'`,
      [userId, sub.merchant_normalized]
    );

    const activityCount = parseInt(recentActivity[0].count);
    const expectedCharges = Math.ceil(ghostInactiveDays / 30);
    const isGhost = activityCount <= expectedCharges;

    await queryAsUser(userId,
      'UPDATE subscriptions SET ghost_flag = $1 WHERE user_id = $2 AND merchant_normalized = $3',
      [isGhost, userId, sub.merchant_normalized]
    );

    if (isGhost) ghostCount++;
  }

  console.log(
    `[Subscription] Detection complete for user ${userId}. Found: ${detected}, Ghost: ${ghostCount}`
  );
  return { detected, ghostCount };
}

/**
 * Run subscription detection for a user.
 * @param {string} userId - UUID
 */
async function runSubscriptionDetection(userId) {
  return detectSubscriptions(userId);
}

module.exports = { runSubscriptionDetection, amountsMatch, matchesInterval };
