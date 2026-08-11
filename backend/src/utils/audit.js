/**
 * Audit Logger
 *
 * Writes security-relevant events to the audit_events table.
 * Never logs OAuth tokens, email bodies, or full transaction contents.
 *
 * Tracked actions:
 *   login_success, login_failure, gmail_connected, gmail_disconnected,
 *   sync_started, data_reset, category_changed, token_refresh_failed
 */

const { query } = require('../db/pool');

/**
 * Record an audit event. Fire-and-forget — never throws.
 *
 * @param {object} opts
 * @param {string|null} opts.userId     - UUID of the acting user (null for unauthenticated events)
 * @param {string}      opts.action     - e.g. 'login_success'
 * @param {string|null} opts.entityType - e.g. 'transaction', 'subscription'
 * @param {string|null} opts.entityId   - UUID of the affected entity
 * @param {object|null} opts.req        - Express request object (for IP / user-agent)
 * @param {object|null} opts.metadata   - Additional non-PII context
 */
async function auditLog({ userId = null, action, entityType = null, entityId = null, req = null, metadata = null }) {
  try {
    const ipAddress = req
      ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null)
      : null;
    const userAgent = req ? (req.headers['user-agent'] || null) : null;

    await query(
      `INSERT INTO audit_events
         (user_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        action,
        entityType || null,
        entityId || null,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // Audit failures must never break the application flow
    console.warn(`[Audit] Failed to write audit event "${action}":`, err.message);
  }
}

module.exports = { auditLog };
