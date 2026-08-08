const { query } = require('../src/db/pool');

async function fixLegacyRows() {
  console.log('[DB Fix] Backfilling user_email for legacy unassigned rows...');

  const r1 = await query(`
    UPDATE raw_emails
    SET user_email = 'sparshgupta625@gmail.com'
    WHERE user_email IS NULL OR user_email = 'default_user@gmail.com'
  `);
  console.log(`[DB Fix] Updated ${r1.rowCount} rows in raw_emails.`);

  const r2 = await query(`
    UPDATE transactions
    SET user_email = 'sparshgupta625@gmail.com'
    WHERE user_email IS NULL OR user_email = 'default_user@gmail.com'
  `);
  console.log(`[DB Fix] Updated ${r2.rowCount} rows in transactions.`);

  const r3 = await query(`
    UPDATE subscriptions
    SET user_email = 'sparshgupta625@gmail.com'
    WHERE user_email IS NULL OR user_email = 'default_user@gmail.com'
  `);
  console.log(`[DB Fix] Updated ${r3.rowCount} rows in subscriptions.`);

  const check = await query(`
    SELECT user_email, COUNT(*) FROM transactions GROUP BY user_email
  `);
  console.log('[DB Fix] Final breakdown by user_email:', check.rows);
  process.exit(0);
}

fixLegacyRows().catch((err) => {
  console.error('[DB Fix] Error:', err);
  process.exit(1);
});
