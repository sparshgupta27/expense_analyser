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
 * Exchange authorization code for tokens and store refresh token.
 */
async function handleCallback(code, overrideRedirectUri) {
  const oauth2Client = createOAuth2Client(overrideRedirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (tokens.access_token) {
    inMemoryAccessToken = tokens.access_token;
  }
  if (tokens.refresh_token) {
    inMemoryRefreshToken = tokens.refresh_token;
  }

  const tokenToSave = tokens.refresh_token || inMemoryRefreshToken || tokens.access_token;

  if (tokenToSave) {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({
        google_refresh: inMemoryRefreshToken || tokens.refresh_token || null,
        google_access: tokens.access_token || null,
        updated_at: new Date()
      }), 'utf8');
    } catch (e) {}

    try {
      await query(
        `INSERT INTO auth_tokens (token_type, token_value, updated_at)
         VALUES ('google_refresh', $1, NOW())
         ON CONFLICT (token_type)
         DO UPDATE SET token_value = $1, updated_at = NOW()`,
        [tokenToSave]
      );
      console.log('[Auth] Token stored successfully in Postgres');
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
  let refreshToken = inMemoryRefreshToken;
  let accessToken = inMemoryAccessToken;

  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (data.google_refresh) refreshToken = data.google_refresh;
      if (data.google_access) accessToken = data.google_access;
    } catch (e) {}
  }

  try {
    const result = await query(
      "SELECT token_value FROM auth_tokens WHERE token_type = 'google_refresh'"
    );
    if (result.rows.length > 0 && result.rows[0].token_value) {
      refreshToken = result.rows[0].token_value;
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
  oauth2Client.setCredentials(credentials);

  return oauth2Client;
}

/**
 * Clear stored OAuth tokens on disconnect/logout.
 */
async function clearAuthToken() {
  inMemoryRefreshToken = null;
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({ google_refresh: null, updated_at: new Date() }), 'utf8');
    } catch (e) {}
  }
  try {
    await query("DELETE FROM auth_tokens WHERE token_type = 'google_refresh'");
  } catch (e) {}
  console.log('[Auth] OAuth token cleared');
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
  clearAuthToken,
};
