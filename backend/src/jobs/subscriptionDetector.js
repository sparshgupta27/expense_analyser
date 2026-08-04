/**
 * Subscription Detector — Nightly Job
 *
 * Groups transactions by normalized merchant, looks for recurring
 * amounts at regular intervals. Detects ghost subscriptions.
 * Runs at 4 AM daily.
 */

const config = require('../config');
const { query } = require('../db/pool');

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
  for (const known of knownIntervals) {
    if (Math.abs(intervalDays - known) <= dayTolerance) {
      return known;
    }
  }
  return null;
}

/**
 * Detect subscriptions from transaction history.
 */
async function detectSubscriptions() {
  console.log('[Subscription] Starting detection...');

  // Get all merchants with 2+ debit transactions
  const { rows: merchants } = await query(`
    SELECT
      merchant_normalized,
      ARRAY_AGG(amount ORDER BY transaction_date) AS amounts,
      ARRAY_AGG(transaction_date ORDER BY transaction_date) AS dates,
      COUNT(*) AS txn_count
    FROM transactions
    WHERE transaction_type = 'debit'
      AND merchant_normalized IS NOT NULL
    GROUP BY merchant_normalized
    HAVING COUNT(*) >= $1
    ORDER BY merchant_normalized
  `, [minOccurrences]);

  let detected = 0;
  let ghostCount = 0;

  for (const merchant of merchants) {
    const amounts = merchant.amounts.map(Number);
    const dates = merchant.dates.map((d) => new Date(d));

    // Check if amounts are consistent (within tolerance)
    const recentAmounts = amounts.slice(-5); // Check last 5
    const referenceAmount = recentAmounts[recentAmounts.length - 1];

    const consistentAmounts = recentAmounts.filter((a) =>
      amountsMatch(a, referenceAmount)
    );

    if (consistentAmounts.length < minOccurrences) continue;

    // Check if intervals are regular
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const diffMs = dates[i].getTime() - dates[i - 1].getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    // Find the most common interval
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

    // This is a subscription! Compute details.
    const lastDate = dates[dates.length - 1];
    const currentAmount = amounts[amounts.length - 1];
    const previousAmount = amounts.length >= 2 ? amounts[amounts.length - 2] : currentAmount;
    const priceChanged = !amountsMatch(currentAmount, previousAmount);

    // Predict next charge
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + matchedInterval);

    // Confidence: higher if more occurrences and consistent intervals
    const intervalConsistency = recentIntervals.filter(
      (i) => matchesInterval(i) === matchedInterval
    ).length / recentIntervals.length;
    const confidence = Math.min(
      1.0,
      (consistentAmounts.length / recentAmounts.length) * intervalConsistency
    );

    // Upsert subscription
    await query(
      `INSERT INTO subscriptions
         (merchant_normalized, current_amount, previous_amount, interval_days,
          next_expected_date, last_charged_date, price_change_flag, confidence, last_detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (merchant_normalized) DO UPDATE SET
         current_amount = $2,
         previous_amount = $3,
         interval_days = $4,
         next_expected_date = $5,
         last_charged_date = $6,
         price_change_flag = $7,
         confidence = $8,
         last_detected_at = NOW()`,
      [
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

    // Update merchant_profiles
    await query(
      `UPDATE merchant_profiles SET is_subscription = true
       WHERE normalized_name = $1`,
      [merchant.merchant_normalized]
    );

    detected++;
    console.log(
      `[Subscription] ${merchant.merchant_normalized}: ₹${currentAmount} every ${matchedInterval}d` +
      `${priceChanged ? ' (PRICE CHANGED)' : ''}`
    );
  }

  // Ghost detection: subscriptions with no other activity in 90 days
  const { rows: subs } = await query('SELECT merchant_normalized FROM subscriptions');

  for (const sub of subs) {
    const { rows: recentActivity } = await query(
      `SELECT COUNT(*) AS count FROM transactions
       WHERE merchant_normalized = $1
         AND transaction_date >= NOW() - INTERVAL '${ghostInactiveDays} days'
         AND transaction_type = 'debit'`,
      [sub.merchant_normalized]
    );

    // A ghost subscription has recurring charges but no additional interaction
    // If the only transactions are the recurring ones (1-3 per interval),
    // and there's no "burst" activity, flag it
    const activityCount = parseInt(recentActivity[0].count);
    const expectedCharges = Math.ceil(ghostInactiveDays / 30); // ~3 for monthly

    const isGhost = activityCount <= expectedCharges;

    await query(
      'UPDATE subscriptions SET ghost_flag = $1 WHERE merchant_normalized = $2',
      [isGhost, sub.merchant_normalized]
    );

    if (isGhost) ghostCount++;
  }

  console.log(
    `[Subscription] Detection complete. Found: ${detected}, Ghost: ${ghostCount}`
  );
  return { detected, ghostCount };
}

// Add unique constraint for upsert (needed for ON CONFLICT)
async function ensureConstraints() {
  try {
    await query(`
      ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_merchant_unique
      UNIQUE (merchant_normalized)
    `);
  } catch (err) {
    // Constraint may already exist
  }
}

async function runSubscriptionDetection() {
  await ensureConstraints();
  return detectSubscriptions();
}

module.exports = { runSubscriptionDetection };
