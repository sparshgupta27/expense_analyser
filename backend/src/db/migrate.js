const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  const client = await pool.connect();

  try {
    // Ensure schema_migrations table exists (bootstrap)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Get already-applied migrations
    const { rows: applied } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(applied.map((r) => r.version));

    // Read migration files, sorted by version number
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = parseInt(file.split('_')[0], 10);
      if (isNaN(version)) {
        console.warn(`[Migrate] Skipping file with no version prefix: ${file}`);
        continue;
      }

      if (appliedVersions.has(version)) {
        console.log(`[Migrate] Skipping already applied: ${file}`);
        continue;
      }

      console.log(`[Migrate] Applying: ${file}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [version, file]
        );
        await client.query('COMMIT');
        console.log(`[Migrate] Applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrate] Failed to apply ${file}:`, err.message);
        throw err;
      }
    }

    console.log('[Migrate] All migrations applied successfully');
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrate] Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
