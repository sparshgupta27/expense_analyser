/**
 * JWT Auth Middleware
 *
 * Reads a JWT from the Authorization header (Bearer <token>)
 * and sets req.user = { id, email } for downstream route handlers.
 * Using a stable UUID as 'sub' (not email) is the tenant key.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Sign a session JWT for the given user.
 * @param {{ id: string, email: string }} user
 */
function signSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,       // stable UUID — used for authorization
      email: user.email,  // metadata only — do NOT use as tenant key
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Verify and decode a JWT.
 * Returns the decoded payload or null if invalid/expired.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header or cookie fallback.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers['x-authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (req.cookies && req.cookies.spendlens_session) {
    return req.cookies.spendlens_session;
  }
  return null;
}

/**
 * Middleware: require a valid JWT.
 * Sets req.user = { id, email }. Returns 401 if missing or invalid.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.sub || !decoded.email) {
    return res.status(401).json({ error: 'Invalid or expired session', code: 'INVALID_TOKEN' });
  }

  req.user = { id: decoded.sub, email: decoded.email };
  next();
}

/**
 * Middleware: optionally decode JWT. Sets req.user or null.
 * Does not reject unauthenticated requests.
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded && decoded.sub && decoded.email) {
      req.user = { id: decoded.sub, email: decoded.email };
    } else {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

module.exports = {
  signSessionToken,
  verifyToken,
  requireAuth,
  optionalAuth,
};
