const { google } = require('googleapis');
const https = require('https');
const config = require('../config');
const { query } = require('../db/pool');

/**
 * Creates an OAuth2 client.
 */
function createOAuth2Client(overrideRedirectUri) {
  const clientId = (config.google.clientId || '').trim();
  const clientSecret = (config.google.clientSecret || '').trim();
  const redirectUri = (overrideRedirectUri || config.google.redirectUri || '').trim();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate the Google OAuth consent URL.
 */
function getAuthUrl(overrideRedirectUri, state) {
  const oauth2Client = createOAuth2Client(overrideRedirectUri);
  const opts = {
    access_type: 'offline',
    prompt: 'consent',
    scope: config.google.scopes,
  };
  if (state && typeof state === 'string' && state.trim()) {
    opts.state = state.trim();
  }
  return oauth2Client.generateAuthUrl(opts);
}

/**
 * Fetch the authenticated user's email using the access token.
 */
async function getUserEmail(accessToken) {
  return new Promise((resolve) => {
    const req = https.get(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`,
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data.email || null);
          } catch (e) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

/**
 * Exchange authorization code for tokens, identify the user, and store tokens per-user.
 */
async function handleCallback(code, overrideRedirectUri) {
  const oauth2Client = createOAuth2Client(overrideRedirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  // Identify user
  let userEmail = null;
  if (tokens.access_token) {
    userEmail = await getUserEmail(tokens.access_token);
  }
  if (!userEmail) {
    throw new Error('Could not determine user email from Google OAuth tokens');
  }

  // Store tokens in DB keyed by (user_email, token_type)
  try {
    if (tokens.refresh_token) {
      await query(
        `INSERT INTO auth_tokens (user_email, token_type, token_value, updated_at)
         VALUES ($1, 'google_refresh', $2, NOW())
         ON CONFLICT (user_email, token_type)
         DO UPDATE SET token_value = $2, updated_at = NOW()`,
        [userEmail, tokens.refresh_token]
      );
    }
    if (tokens.access_token) {
      await query(
        `INSERT INTO auth_tokens (user_email, token_type, token_value, updated_at)
         VALUES ($1, 'google_access', $2, NOW())
         ON CONFLICT (user_email, token_type)
         DO UPDATE SET token_value = $2, updated_at = NOW()`,
        [userEmail, JSON.stringify({
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date || null,
        })]
      );
    }
    console.log(`[Auth] Tokens stored for ${userEmail}`);
  } catch (dbErr) {
    console.warn('[Auth] Failed to store tokens in DB:', dbErr.message);
  }

  return { tokens, userEmail };
}

/**
 * Get an authenticated OAuth2 client for a specific user.
 * Returns null if no token is stored for this user.
 */
async function getAuthenticatedClient(userEmail) {
  if (!userEmail) {
    console.warn('[Auth] getAuthenticatedClient called without userEmail');
    return null;
  }

  let refreshToken = null;
  let accessToken = null;
  let tokenExpiry = null;

  try {
    const result = await query(
      `SELECT token_type, token_value FROM auth_tokens
       WHERE user_email = $1
         AND token_type IN ('google_refresh', 'google_access')`,
      [userEmail]
    );
    for (const row of result.rows) {
      if (row.token_type === 'google_refresh' && row.token_value) {
        refreshToken = row.token_value;
      }
      if (row.token_type === 'google_access' && row.token_value) {
        try {
          const parsed = JSON.parse(row.token_value);
          accessToken = parsed.access_token || null;
          tokenExpiry = parsed.expiry_date || null;
        } catch (e) {
          accessToken = row.token_value;
        }
      }
    }
  } catch (e) {
    console.warn('[Auth] DB query failed:', e.message);
  }

  if (!refreshToken && !accessToken) {
    console.warn(`[Auth] No OAuth token found for ${userEmail}`);
    return null;
  }

  const oauth2Client = createOAuth2Client();
  const credentials = {};
  if (accessToken) credentials.access_token = accessToken;
  if (refreshToken) credentials.refresh_token = refreshToken;
  if (tokenExpiry) credentials.expiry_date = tokenExpiry;
  oauth2Client.setCredentials(credentials);

  if (refreshToken) {
    try {
      await oauth2Client.getAccessToken();
    } catch (err) {
      console.warn(`[Auth] Stored refresh token invalid for ${userEmail}:`, err.message);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Clear stored OAuth tokens for a specific user.
 */
async function clearAuthToken(userEmail) {
  if (!userEmail) return;
  try {
    await query(
      "DELETE FROM auth_tokens WHERE user_email = $1",
      [userEmail]
    );
    console.log(`[Auth] Tokens cleared for ${userEmail}`);
  } catch (e) {
    console.warn('[Auth] Failed to clear tokens:', e.message);
  }
}

/**
 * Get all user emails that have stored refresh tokens (for cron sync).
 */
async function getAllAuthenticatedUsers() {
  try {
    const result = await query(
      "SELECT DISTINCT user_email FROM auth_tokens WHERE token_type = 'google_refresh' AND user_email IS NOT NULL"
    );
    return result.rows.map(r => r.user_email);
  } catch (e) {
    return [];
  }
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
  clearAuthToken,
  getUserEmail,
  getAllAuthenticatedUsers,
};
