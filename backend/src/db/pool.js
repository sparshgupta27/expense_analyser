const { Pool } = require('pg');
const config = require('../config');

const poolConfig = config.postgres.connectionString
  ? {
      connectionString: config.postgres.connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

pool.on('connect', () => {
  console.log('[DB] New client connected to pool');
});

/**
 * Execute a query with optional params.
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
  }

  return result;
}

/**
 * Get a client from the pool for transaction support.
 * Caller must release the client after use.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return pool.connect();
}

/**
 * Execute a query scoped to a specific user via Postgres RLS.
 *
 * Sets SET LOCAL app.current_user_id = '<userId>' within a transaction
 * so the RLS policy "user_id = current_setting('app.current_user_id')::uuid"
 * is honoured for every user-owned table.
 *
 * @param {string} userId - UUID of the authenticated user
 * @param {string} text   - SQL query
 * @param {Array}  params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function queryAsUser(userId, text, params) {
  if (!userId) {
    // Fall back to unscoped query (e.g. cron bootstrap, migrations)
    return query(text, params);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL is transaction-scoped — cleared automatically on COMMIT/ROLLBACK
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, queryAsUser, getClient };
