/**
 * Transaction Categorizer — User Scoped (UUID)
 *
 * Categorization priority:
 * 1. Manual override (category_overrides table) — always wins
 * 2. Exact match in category_rules
 * 3. Fuzzy match via Fuse.js
 * 4. Default to "Other"
 */

const Fuse = require('fuse.js');
const { query, queryAsUser } = require('../db/pool');

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
 * @param {string} transactionId
 * @param {string} userId - UUID
 */
async function getOverride(transactionId, userId) {
  if (!transactionId || !userId) return null;

  const result = await queryAsUser(
    userId,
    'SELECT category FROM category_overrides WHERE transaction_id = $1 AND user_id = $2',
    [transactionId, userId]
  );

  return result.rows.length > 0 ? result.rows[0].category : null;
}

/**
 * Categorize a merchant name.
 * @param {string} merchantNormalized
 * @param {string|null} transactionId - Optional transaction ID to check overrides
 * @param {string|null} userId - UUID of the user
 * @returns {Promise<string>} The category
 */
async function categorize(merchantNormalized, transactionId = null, userId = null) {
  // 1. Check manual override first
  if (transactionId && userId) {
    const override = await getOverride(transactionId, userId);
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
 * @param {string} transactionId
 * @param {string} category
 * @param {string} userId - UUID
 */
async function setOverride(transactionId, category, userId) {
  await queryAsUser(
    userId,
    `INSERT INTO category_overrides (user_id, transaction_id, category, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, transaction_id)
     DO UPDATE SET category = $3, updated_at = NOW()`,
    [userId, transactionId, category]
  );
}

module.exports = { categorize, setOverride, loadRules };
