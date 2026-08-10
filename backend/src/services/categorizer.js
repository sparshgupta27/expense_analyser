/**
 * Transaction Categorizer — User Scoped
 *
 * Categorization priority:
 * 1. Manual override (category_overrides table) — always wins
 * 2. Exact match in category_rules
 * 3. Fuzzy match via Fuse.js
 * 4. Default to "Other"
 */

const Fuse = require('fuse.js');
const { query } = require('../db/pool');

let cachedRules = null;
let fuseIndex = null;
let lastCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Load category rules from DB and build fuzzy index.
 */
async function loadRules() {
  const now = Date.now();
  if (cachedRules && now - lastCacheTime < CACHE_TTL) {
    return;
  }

  const result = await query(
    'SELECT pattern, category FROM category_rules ORDER BY priority DESC'
  );
  cachedRules = result.rows;

  fuseIndex = new Fuse(cachedRules, {
    keys: ['pattern'],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 3,
  });

  lastCacheTime = now;
  console.log(`[Categorizer] Loaded ${cachedRules.length} category rules`);
}

/**
 * Check for a manual category override for a transaction.
 */
async function getOverride(transactionId, userEmail) {
  if (!transactionId) return null;

  const result = await query(
    'SELECT category FROM category_overrides WHERE transaction_id = $1 AND (user_email = $2 OR user_email IS NULL)',
    [transactionId, userEmail]
  );

  return result.rows.length > 0 ? result.rows[0].category : null;
}

/**
 * Categorize a merchant name.
 * @param {string} merchantNormalized - The normalized merchant name
 * @param {string|null} transactionId - Optional transaction ID to check overrides
 * @param {string|null} userEmail - User email
 * @returns {Promise<string>} The category
 */
async function categorize(merchantNormalized, transactionId = null, userEmail = null) {
  // 1. Check manual override first
  if (transactionId && userEmail) {
    const override = await getOverride(transactionId, userEmail);
    if (override) return override;
  }

  await loadRules();

  const merchantLower = merchantNormalized.toLowerCase();

  // 2. Exact match (case-insensitive substring match)
  for (const rule of cachedRules) {
    if (merchantLower.includes(rule.pattern.toLowerCase())) {
      return rule.category;
    }
  }

  // 3. Fuzzy match
  const fuzzyResults = fuseIndex.search(merchantNormalized);
  if (fuzzyResults.length > 0 && fuzzyResults[0].score < 0.3) {
    return fuzzyResults[0].item.category;
  }

  // 4. Default
  return 'Other';
}

/**
 * Set a manual category override for a transaction.
 */
async function setOverride(transactionId, category, userEmail) {
  await query(
    `INSERT INTO category_overrides (user_email, transaction_id, category, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (transaction_id)
     DO UPDATE SET user_email = $1, category = $3, updated_at = NOW()`,
    [userEmail, transactionId, category]
  );
}

module.exports = { categorize, setOverride, loadRules };
