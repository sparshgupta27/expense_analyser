const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { query } = require('../db/pool');

const TOKEN_FILE = path.resolve(__dirname, '../../../.tokens.json');
let inMemoryRefreshToken = null;

let currentActiveEmail = null;

// Load initial token from file fallback if present
try {
  if (fs.existsSync(TOKEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (data.user_email && data.user_email !== 'default_user@gmail.com') {
      inMemoryRefreshToken = data.google_refresh || null;
      currentActiveEmail = data.user_email || null;
    } else {
      try { fs.unlinkSync(TOKEN_FILE); } catch (e) {}
    }
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
 * Prompts user to select account so switching Gmail on the same laptop works cleanly.
 */
function getAuthUrl(overrideRedirectUri, state) {
  const oauth2Client = createOAuth2Client(overrideRedirectUri);
  const opts = {
    access_type: 'offline',
    prompt: 'select_account consent',
    scope: config.google.scopes,
  };
  if (state && typeof state === 'string' && state.trim()) {
    opts.state = state.trim();
  }
  return oauth2Client.generateAuthUrl(opts);
}

/**
 * Extract active target user email from HTTP request headers or current active email.
 * Rejects default_user@gmail.com.
 */
function getRequestUserEmail(req) {
  const headerEmail = req?.headers ? req.headers['x-user-email'] : null;
  if (headerEmail && typeof headerEmail === 'string' && headerEmail.trim()) {
    const clean = headerEmail.toLowerCase().trim();
    if (clean !== 'default_user@gmail.com') return clean;
  }
  const queryEmail = req?.query ? req.query.user_email : null;
  if (queryEmail && typeof queryEmail === 'string' && queryEmail.trim()) {
    const clean = queryEmail.toLowerCase().trim();
    if (clean !== 'default_user@gmail.com') return clean;
  }
  const active = getCurrentUserEmail();
  if (active && active !== 'default_user@gmail.com') return active;
  return null;
}

/**
 * Exchange authorization code for tokens, fetch profile email, and store tokens scoped by user_email.
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

  oauth2Client.setCredentials(tokens);

  // Fetch Google user profile to obtain user's email address
  let userEmail = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    if (userInfo && userInfo.email) {
      userEmail = userInfo.email.toLowerCase().trim();
    }
  } catch (err) {
    console.warn('[Auth] Failed to fetch Google userinfo email:', err.message);
  }

  if (!userEmail || userEmail === 'default_user@gmail.com') {
    throw new Error('Failed to retrieve valid email address from Google profile.');
  }

  currentActiveEmail = userEmail;

  if (tokens.refresh_token || tokens.access_token || inMemoryRefreshToken) {
    try {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({
        user_email: userEmail,
        google_refresh: inMemoryRefreshToken || tokens.refresh_token || null,
        google_access: tokens.access_token || null,
        google_expiry: tokens.expiry_date || null,
        updated_at: new Date()
      }), 'utf8');
    } catch (e) {}

    try {
      if (tokens.refresh_token || inMemoryRefreshToken) {
        await query(
          `INSERT INTO auth_tokens (token_type, token_value, user_email, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (token_type)
           DO UPDATE SET token_value = $2, user_email = $3, updated_at = NOW()`,
          [`google_refresh_${userEmail}`, tokens.refresh_token || inMemoryRefreshToken, userEmail]
        );
      }
      if (tokens.access_token) {
        await query(
          `INSERT INTO auth_tokens (token_type, token_value, user_email, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (token_type)
           DO UPDATE SET token_value = $2, user_email = $3, updated_at = NOW()`,
          [
            `google_access_${userEmail}`,
            JSON.stringify({
              access_token: tokens.access_token,
              expiry_date: tokens.expiry_date || null,
            }),
            userEmail
          ]
        );
      }
      console.log(`[Auth] Token stored successfully for user ${userEmail}`);
    } catch (dbErr) {
      console.warn('[Auth] Postgres unavailable — stored token in local fallback file');
    }
  }

  return { tokens, userEmail };
}

/**
 * Get current active user email.
 */
function getCurrentUserEmail() {
  if (currentActiveEmail === 'default_user@gmail.com') return null;
  return currentActiveEmail;
}

/**
 * Get an authenticated OAuth2 client using stored refresh token for active user.
 * Returns null if no active user is logged in.
 */
async function getAuthenticatedClient(targetEmail) {
  const activeEmail = targetEmail || currentActiveEmail;
  if (!activeEmail || activeEmail === 'default_user@gmail.com') {
    return null;
  }

  let refreshToken = inMemoryRefreshToken;
  let accessToken = inMemoryAccessToken;

  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (data.user_email === activeEmail) {
        if (data.google_refresh) refreshToken = data.google_refresh;
        if (data.google_access) accessToken = data.google_access;
        if (data.google_expiry) inMemoryTokenExpiry = data.google_expiry;
      }
    } catch (e) {}
  }

  try {
    const result = await query(
      "SELECT token_type, token_value FROM auth_tokens WHERE user_email = $1",
      [activeEmail]
    );
    for (const row of result.rows) {
      if (row.token_type.startsWith('google_refresh') && row.token_value) {
        refreshToken = row.token_value;
      }
      if (row.token_type.startsWith('google_access') && row.token_value) {
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
      console.warn(`[Auth] Stored Google refresh token for ${activeEmail} is invalid:`, err.message);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Clear stored OAuth tokens on disconnect/logout.
 */
async function clearAuthToken(targetEmail) {
  const activeEmail = targetEmail || currentActiveEmail;
  inMemoryRefreshToken = null;
  inMemoryAccessToken = null;
  inMemoryTokenExpiry = null;
  currentActiveEmail = null;

  if (fs.existsSync(TOKEN_FILE)) {
    try { fs.unlinkSync(TOKEN_FILE); } catch (e) {}
  }

  if (activeEmail) {
    try {
      await query("DELETE FROM auth_tokens WHERE user_email = $1", [activeEmail]);
    } catch (e) {}
  } else {
    try {
      await query("DELETE FROM auth_tokens");
    } catch (e) {}
  }
  console.log(`[Auth] OAuth token cleared for ${activeEmail || 'all accounts'}`);
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  handleCallback,
  getAuthenticatedClient,
  getCurrentUserEmail,
  getRequestUserEmail,
  clearAuthToken,
};
