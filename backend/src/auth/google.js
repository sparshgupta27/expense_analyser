const { google } = require('googleapis');
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
function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * Generate the Google OAuth consent URL.
 */
function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: config.google.scopes,
  });
}

/**
 * Exchange authorization code for tokens and store refresh token.
 */
async function handleCallback(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  const refreshToken = tokens.refresh_token || tokens.access_token;

  if (refreshToken) {
    inMemoryRefreshToken = refreshToken;
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({ google_refresh: refreshToken, updated_at: new Date() }), 'utf8');
    } catch (e) {}

    try {
      await query(
        `INSERT INTO auth_tokens (token_type, token_value, updated_at)
         VALUES ('google_refresh', $1, NOW())
         ON CONFLICT (token_type)
         DO UPDATE SET token_value = $1, updated_at = NOW()`,
        [refreshToken]
      );
      console.log('[Auth] Refresh token stored in Postgres');
    } catch (dbErr) {
      console.warn('[Auth] Postgres unavailable — stored token in local fallback file');
    }
  }

  return tokens;
}

/**
 * Get an authenticated OAuth2 client using stored refresh token.
 * Returns null if no token is stored.
 */
async function getAuthenticatedClient() {
  let tokenValue = inMemoryRefreshToken;

  // Always read latest token from file fallback
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (data.google_refresh) {
        tokenValue = data.google_refresh;
        inMemoryRefreshToken = tokenValue;
      }
    } catch (e) {}
  }

  try {
    const result = await query(
      "SELECT token_value FROM auth_tokens WHERE token_type = 'google_refresh'"
    );
    if (result.rows.length > 0 && result.rows[0].token_value) {
      if (!tokenValue) {
        tokenValue = result.rows[0].token_value;
      } else if (result.rows[0].token_value !== tokenValue) {
        // Sync Postgres if file token is newer
        await query(
          `INSERT INTO auth_tokens (token_type, token_value, updated_at)
           VALUES ('google_refresh', $1, NOW())
           ON CONFLICT (token_type) DO UPDATE SET token_value = $1, updated_at = NOW()`,
          [tokenValue]
        );
      }
    }
  } catch (e) {
    // Postgres offline, use in-memory / file token fallback
  }

  if (!tokenValue) {
    console.warn('[Auth] No refresh token found. User must authorize first.');
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: tokenValue,
  });

  return oauth2Client;
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
};
