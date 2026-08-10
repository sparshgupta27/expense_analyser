const express = require('express');
const { getAuthUrl, handleCallback, getAuthenticatedClient, clearAuthToken } = require('../auth/google');
const { signSessionToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

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
  if (originParam && (originParam.startsWith('http://') || originParam.startsWith('https://'))) {
    frontendOrigin = originParam;
  } else if (referer) {
    try {
      const u = new URL(referer);
      frontendOrigin = u.origin;
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
      if (decoded && (decoded.startsWith('http://') || decoded.startsWith('https://'))) {
        frontendUrl = decoded;
      }
    } catch (e) {}
  }

  if (error || !code) {
    console.warn('[Auth] OAuth authorization was cancelled or failed:', error || 'Missing code');
    return res.redirect(`${frontendUrl}/?error=auth_cancelled`);
  }

  try {
    const redirectUri = getRequestRedirectUri(req);
    // handleCallback now returns { user: { id, email } }
    const { user } = await handleCallback(code, redirectUri);

    // Sign JWT with stable UUID as sub
    const sessionToken = signSessionToken(user);

    console.log(`[Auth] Google OAuth succeeded for ${user.email} (id=${user.id}) — issuing JWT`);
    res.redirect(`${frontendUrl}/?connected=true&autosync=true&token=${encodeURIComponent(sessionToken)}`);
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err.message);
    res.redirect(`${frontendUrl}/?error=auth_failed`);
  }
});

/**
 * GET /auth/status
 * Check if the current user has a valid OAuth token.
 * Reads user identity from JWT (Authorization header).
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
 * Disconnect current account and clear tokens for this user.
 */
router.post('/logout', optionalAuth, async (req, res) => {
  try {
    if (req.user) {
      await clearAuthToken(req.user.id);
      console.log(`[Auth] User ${req.user.email} (id=${req.user.id}) disconnected.`);
    }
    res.json({ message: 'Account disconnected successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Disconnect failed', details: err.message });
  }
});

module.exports = router;
