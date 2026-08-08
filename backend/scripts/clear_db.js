const { query } = require('../src/db/pool');

async function clearDatabase() {
  console.log('[DB Clear] Truncating all user, transaction, and auth tables...');

  try {
    await query(`
      TRUNCATE TABLE category_overrides, transactions, raw_emails, subscriptions, auth_tokens, merchant_profiles CASCADE;
    `);
    console.log('[DB Clear] Successfully wiped all tables!');
  } catch (err) {
    console.warn('[DB Clear] Partial truncation error (falling back to DELETE):', err.message);
    await query('DELETE FROM category_overrides');
    await query('DELETE FROM transactions');
    await query('DELETE FROM raw_emails');
    await query('DELETE FROM subscriptions');
    await query('DELETE FROM auth_tokens');
    await query('DELETE FROM merchant_profiles');
    console.log('[DB Clear] Successfully cleared all table rows!');
  }

  process.exit(0);
}

clearDatabase().catch((err) => {
  console.error('[DB Clear] Error clearing database:', err);
  process.exit(1);
});
