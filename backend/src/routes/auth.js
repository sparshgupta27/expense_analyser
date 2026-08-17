const express = require('express');
const { getAuthUrl, handleCallback, getAuthenticatedClient, clearAuthToken } = require('../auth/google');
const { signSessionToken, optionalAuth } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');

const router = express.Router();

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

function sanitizeOrigin(origin) {
  if (origin && ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) {
    return origin;
  }
  return process.env.FRONTEND_URL || 'http://localhost:3000';
}

function getRequestRedirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/auth/google/callback`;
}

/**
 * GET /auth/google
 * Redirects user to Google OAuth consent screen.
 */
router.get('/google', (req, res) => {
  const redirectUri = getRequestRedirectUri(req);
  const originParam = req.query.origin;
  const referer = req.headers.referer || req.headers.origin || '';
  let frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
  if (originParam) {
    frontendOrigin = sanitizeOrigin(originParam);
  } else if (referer) {
    try {
      const u = new URL(referer);
      frontendOrigin = sanitizeOrigin(u.origin);
    } catch (e) {}
  }
  const state = Buffer.from(frontendOrigin).toString('base64url');
  const url = getAuthUrl(redirectUri, state);
  res.redirect(url);
});

/**
 * GET /auth/google/callback
 * Handles OAuth callback, exchanges code for tokens, upserts user,
 * issues JWT session (sub = user UUID), redirects to frontend.
 */
router.get('/google/callback', async (req, res) => {
  const { code, error, state } = req.query;

  let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  if (state) {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      frontendUrl = sanitizeOrigin(decoded);
    } catch (e) {}
  }

  if (error || !code) {
    console.warn('[Auth] OAuth authorization was cancelled or failed:', error || 'Missing code');
    await auditLog({ action: 'login_failure', req, metadata: { reason: error || 'missing_code' } });
    return res.redirect(`${frontendUrl}/?error=auth_cancelled`);
  }

  try {
    const redirectUri = getRequestRedirectUri(req);
    const { user } = await handleCallback(code, redirectUri);

    const sessionToken = signSessionToken(user);

    await auditLog({
      userId: user.id,
      action: 'gmail_connected',
      req,
      metadata: { email: user.email },
    });

    console.log(`[Auth] Google OAuth succeeded for ${user.email} (id=${user.id}) — issuing JWT`);
    // Set JWT as httpOnly cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('spendlens_session', sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    res.redirect(`${frontendUrl}/?connected=true&autosync=true`);
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err.message);
    await auditLog({ action: 'login_failure', req, metadata: { reason: err.message } });
    res.redirect(`${frontendUrl}/?error=auth_failed`);
  }
});

/**
 * GET /auth/status
 * Check if the current user has a valid OAuth token.
 */
router.get('/status', optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.json({
        authenticated: false,
        email: null,
        message: 'Not authenticated. No session token.',
      });
    }

    const client = await getAuthenticatedClient(req.user.id);
    res.json({
      authenticated: !!client,
      email: client ? req.user.email : null,
      message: client
        ? 'Gmail access is configured'
        : 'Not authenticated. Visit /auth/google to authorize.',
    });
  } catch (err) {
    res.json({ authenticated: false, email: null, message: err.message });
  }
});

/**
 * POST /auth/logout
 * Disconnect current account and clear Google tokens for this user.
 */
router.post('/logout', optionalAuth, async (req, res) => {
  try {
    if (req.user) {
      await clearAuthToken(req.user.id);
      await auditLog({
        userId: req.user.id,
        action: 'gmail_disconnected',
        req,
        metadata: { email: req.user.email },
      });
      console.log(`[Auth] User ${req.user.email} (id=${req.user.id}) disconnected.`);
    }
    res.clearCookie('spendlens_session', { path: '/' });
    res.json({ message: 'Account disconnected successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Disconnect failed', details: err.message });
  }
});

module.exports = router;
