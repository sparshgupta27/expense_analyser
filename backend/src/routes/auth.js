const express = require('express');
const { getAuthUrl, handleCallback, getAuthenticatedClient, clearAuthToken } = require('../auth/google');
const { syncEmails } = require('../services/gmailIngestion');
const mockStore = require('../db/mockStore');

const router = express.Router();

/**
 * GET /auth/google
 * Redirects user to Google OAuth consent screen.
 */
router.get('/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

/**
 * GET /auth/google/callback
 * Handles OAuth callback, exchanges code for tokens, runs automatic email sync, and redirects to dashboard.
 */
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    console.warn('[Auth] OAuth authorization was cancelled or failed:', error || 'Missing code');
    return res.redirect('http://localhost:3000/?error=auth_cancelled');
  }

  try {
    await handleCallback(code);
    console.log('[Auth] Google OAuth succeeded — running immediate sync for new account...');
    await syncEmails();
    res.redirect('http://localhost:3000/?connected=true');
  } catch (err) {
    console.error('[Auth] OAuth callback error:', err.message);
    res.redirect('http://localhost:3000/?error=auth_failed');
  }
});

/**
 * GET /auth/status
 * Check if we have a valid OAuth token.
 */
router.get('/status', async (req, res) => {
  try {
    const client = await getAuthenticatedClient();
    res.json({
      authenticated: !!client,
      message: client
        ? 'Gmail access is configured'
        : 'Not authenticated. Visit /auth/google to authorize.',
    });
  } catch (err) {
    res.json({ authenticated: false, message: err.message });
  }
});

/**
 * POST /auth/logout
 * Disconnect current account and clear tokens.
 */
router.post('/logout', async (req, res) => {
  try {
    await clearAuthToken();
    mockStore.clearRealTransactions();
    res.json({ message: 'Account disconnected successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Disconnect failed', details: err.message });
  }
});

module.exports = router;
