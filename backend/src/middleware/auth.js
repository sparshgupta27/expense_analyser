/**
 * JWT Auth Middleware
 *
 * Reads a JWT from the Authorization header (Bearer <token>)
 * and sets req.userEmail for downstream route handlers.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Sign a session JWT for the given email.
 */
function signSessionToken(email) {
  return jwt.sign({ email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Verify and decode a JWT.
 * Returns the decoded payload or null if invalid.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Fallback: check cookie
  if (req.cookies && req.cookies.spendlens_session) {
    return req.cookies.spendlens_session;
  }
  return null;
}

/**
 * Middleware: require a valid JWT. Returns 401 if missing or invalid.
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.email) {
    return res.status(401).json({ error: 'Invalid or expired session', code: 'INVALID_TOKEN' });
  }

  req.userEmail = decoded.email;
  next();
}

/**
 * Middleware: optionally decode JWT. Sets req.userEmail or null.
 * Does not reject unauthenticated requests.
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    const decoded = verifyToken(token);
    req.userEmail = decoded?.email || null;
  } else {
    req.userEmail = null;
  }
  next();
}

module.exports = {
  signSessionToken,
  verifyToken,
  requireAuth,
  optionalAuth,
};
