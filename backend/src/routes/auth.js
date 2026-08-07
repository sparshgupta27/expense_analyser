const express = require('express');
const { getAuthUrl, handleCallback, getAuthenticatedClient, getCurrentUserEmail, getRequestUserEmail, clearAuthToken } = require('../auth/google');
const mockStore = require('../db/mockStore');

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
 * Handles OAuth callback, exchanges code for tokens, runs automatic email sync, and redirects to dashboard.
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
    const { userEmail } = await handleCallback(code, redirectUri);
    console.log(`[Auth] Google OAuth succeeded for ${userEmail} — redirecting to ${frontendUrl}...`);
    res.redirect(`${frontendUrl}/?connected=true&autosync=true&email=${encodeURIComponent(userEmail)}`);
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err.message);
    res.redirect(`${frontendUrl}/?error=auth_failed`);
  }
});

/**
 * GET /auth/status
 * Check if we have a valid OAuth token and return user email.
 */
router.get('/status', async (req, res) => {
  try {
    const email = getRequestUserEmail(req);
    if (!email || email === 'default_user@gmail.com') {
      return res.json({
        authenticated: false,
        user_email: null,
        message: 'Not authenticated. Visit /auth/google to authorize.',
      });
    }
    const client = await getAuthenticatedClient(email);
    res.json({
      authenticated: !!client,
      user_email: client ? email : null,
      message: client
        ? `Gmail access is configured for ${email}`
        : 'Not authenticated. Visit /auth/google to authorize.',
    });
  } catch (err) {
    res.json({ authenticated: false, user_email: null, message: err.message });
  }
});

/**
 * POST /auth/logout
 * Disconnect current account and clear tokens.
 */
router.post('/logout', async (req, res) => {
  try {
    const email = getCurrentUserEmail();
    await clearAuthToken(email);
    mockStore.clearRealTransactions(email);
    res.json({ message: 'Account disconnected successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Disconnect failed', details: err.message });
  }
});

module.exports = router;
