const { Pool } = require('pg');
const config = require('../config');

const poolConfig = config.postgres.connectionString
  ? {
      connectionString: config.postgres.connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    }
  : {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 10,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.warn('[DB] Unexpected pool error (handled):', err.message);
});

pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.warn('[DB] Client connection error (handled):', err.message);
  });
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
 * Uses SELECT set_config($1, $2, true) — parameterized and safe against
 * injection. The third argument `true` means the setting is local to
 * the current transaction (equivalent to SET LOCAL).
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
    // Parameterized — immune to injection even if userId format is unexpected
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_user_id',
      userId.toString(),
    ]);
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

/**
 * Run multiple queries in a single RLS-scoped transaction.
 * Avoids opening multiple connections for multi-step operations.
 *
 * @param {string}   userId   - UUID of the authenticated user
 * @param {Function} callback - async (client) => result
 * @returns {Promise<any>}
 */
async function withUserTransaction(userId, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.current_user_id',
      userId ? userId.toString() : '',
    ]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, queryAsUser, withUserTransaction, getClient };
