const { google } = require('googleapis');
const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { query } = require('../db/pool');

const TOKEN_FILE = path.resolve(__dirname, '../../../.tokens.json');
let inMemoryRefreshToken = null;

// Load initial token from file fallback if present
try {
  if (fs.existsSync(TOKEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    inMemoryRefreshToken = data.google_refresh || null;
  }
} catch (e) {}

/**
 * Creates an OAuth2 client with stored credentials or fresh ones.
 */
function createOAuth2Client(overrideRedirectUri) {
  const clientId = (config.google.clientId || '').trim();
  const clientSecret = (config.google.clientSecret || '').trim();
  const redirectUri = (overrideRedirectUri || config.google.redirectUri || '').trim();
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

let inMemoryAccessToken = null;
let inMemoryTokenExpiry = null;

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
  return new Promise((resolve, reject) => {
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
 * Exchange authorization code for tokens and store refresh token.
 */
async function handleCallback(code, overrideRedirectUri) {
  const oauth2Client = createOAuth2Client(overrideRedirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (tokens.access_token) {
    inMemoryAccessToken = tokens.access_token;
  }
  if (tokens.expiry_date) {
    inMemoryTokenExpiry = tokens.expiry_date;
  }
  if (tokens.refresh_token) {
    inMemoryRefreshToken = tokens.refresh_token;
  }

  // Detect if the connected account changed
  let accountChanged = false;
  let userEmail = null;
  try {
    if (tokens.access_token) {
      userEmail = await getUserEmail(tokens.access_token);
    }
    if (userEmail) {
      // Check previously stored email
      let previousEmail = null;
      try {
        const result = await query(
          "SELECT token_value FROM auth_tokens WHERE token_type = 'connected_email'"
        );
        if (result.rows.length > 0) {
          previousEmail = result.rows[0].token_value;
        }
      } catch (e) {}

      if (previousEmail && previousEmail.toLowerCase() !== userEmail.toLowerCase()) {
        accountChanged = true;
        console.log(`[Auth] Account changed: ${previousEmail} → ${userEmail}`);
      }

      // Store current email
      try {
        await query(
          `INSERT INTO auth_tokens (token_type, token_value, updated_at)
           VALUES ('connected_email', $1, NOW())
           ON CONFLICT (token_type)
           DO UPDATE SET token_value = $1, updated_at = NOW()`,
          [userEmail]
        );
      } catch (e) {}
    }
  } catch (e) {
    console.warn('[Auth] Could not detect account change:', e.message);
  }

  if (tokens.refresh_token || tokens.access_token || inMemoryRefreshToken) {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({
        google_refresh: inMemoryRefreshToken || tokens.refresh_token || null,
        google_access: tokens.access_token || null,
        google_expiry: tokens.expiry_date || null,
        connected_email: userEmail || null,
        updated_at: new Date()
      }), 'utf8');
    } catch (e) {}

    try {
      if (tokens.refresh_token || inMemoryRefreshToken) {
        await query(
          `INSERT INTO auth_tokens (token_type, token_value, updated_at)
           VALUES ('google_refresh', $1, NOW())
           ON CONFLICT (token_type)
           DO UPDATE SET token_value = $1, updated_at = NOW()`,
          [tokens.refresh_token || inMemoryRefreshToken]
        );
      }
      if (tokens.access_token) {
        await query(
          `INSERT INTO auth_tokens (token_type, token_value, updated_at)
           VALUES ('google_access', $1, NOW())
           ON CONFLICT (token_type)
           DO UPDATE SET token_value = $1, updated_at = NOW()`,
          [JSON.stringify({
            access_token: tokens.access_token,
            expiry_date: tokens.expiry_date || null,
          })]
        );
      }
      console.log('[Auth] Token stored successfully in Postgres');
    } catch (dbErr) {
      console.warn('[Auth] Postgres unavailable — stored token in local fallback file');
    }
  }

  return { tokens, accountChanged, userEmail };
}

/**
 * Get an authenticated OAuth2 client using stored refresh token.
 * Returns null if no token is stored.
 */
async function getAuthenticatedClient() {
  let refreshToken = inMemoryRefreshToken;
  let accessToken = inMemoryAccessToken;

  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (data.google_refresh) refreshToken = data.google_refresh;
      if (data.google_access) accessToken = data.google_access;
      if (data.google_expiry) inMemoryTokenExpiry = data.google_expiry;
    } catch (e) {}
  }

  try {
    const result = await query(
      "SELECT token_type, token_value FROM auth_tokens WHERE token_type IN ('google_refresh', 'google_access')"
    );
    for (const row of result.rows) {
      if (row.token_type === 'google_refresh' && row.token_value) {
        refreshToken = row.token_value;
      }
      if (row.token_type === 'google_access' && row.token_value) {
        try {
          const parsed = JSON.parse(row.token_value);
          accessToken = parsed.access_token || accessToken;
          inMemoryTokenExpiry = parsed.expiry_date || inMemoryTokenExpiry;
        } catch (e) {
          accessToken = row.token_value;
        }
      }
    }
  } catch (e) {}

  if (!refreshToken && !accessToken) {
    console.warn('[Auth] No OAuth token found. User must authorize first.');
    return null;
  }

  const oauth2Client = createOAuth2Client();
  const credentials = {};
  if (accessToken) credentials.access_token = accessToken;
  if (refreshToken) credentials.refresh_token = refreshToken;
  if (inMemoryTokenExpiry) credentials.expiry_date = inMemoryTokenExpiry;
  oauth2Client.setCredentials(credentials);

  if (refreshToken) {
    try {
      await oauth2Client.getAccessToken();
    } catch (err) {
      console.warn('[Auth] Stored Google refresh token is invalid:', err.message);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Clear stored OAuth tokens on disconnect/logout.
 */
async function clearAuthToken() {
  inMemoryRefreshToken = null;
  inMemoryAccessToken = null;
  inMemoryTokenExpiry = null;
  if (fs.existsSync(TOKEN_FILE)) {
    try { fs.unlinkSync(TOKEN_FILE); } catch (e) {}
  }
  try {
    await query("DELETE FROM auth_tokens WHERE token_type IN ('google_refresh', 'google_access')");
  } catch (e) {}
  console.log('[Auth] OAuth token cleared');
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
  clearAuthToken,
  getUserEmail,
};
