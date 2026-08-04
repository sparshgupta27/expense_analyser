const express = require('express');
const { getAuthUrl, handleCallback, getAuthenticatedClient } = require('../auth/google');
const { syncEmails } = require('../services/gmailIngestion');

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
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    await handleCallback(code);
    // Automatically trigger email sync for newly connected account
    console.log('[Auth] Google OAuth succeeded — running immediate sync for new account...');
    await syncEmails();
    // Redirect user back to frontend dashboard with success flag
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

module.exports = router;
