const { google } = require('googleapis');
const https = require('https');
const config = require('../config');
const { query } = require('../db/pool');
const { encryptToken, decryptToken } = require('../utils/encrypt');

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
 * Fetch the authenticated user's email and Google subject ID using the access token.
 */
async function getUserInfo(accessToken) {
  return new Promise((resolve) => {
    const req = https.get(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`,
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({
              email: data.email || null,
              googleSubject: data.id || null,
            });
          } catch (e) {
            resolve({ email: null, googleSubject: null });
          }
        });
      }
    );
    req.on('error', () => resolve({ email: null, googleSubject: null }));
    req.end();
  });
}

/**
 * Exchange authorization code for tokens, upsert the user into the users table,
 * and store encrypted OAuth tokens keyed by user_id (UUID).
 *
 * @returns {{ user: { id: string, email: string } }}
 */
async function handleCallback(code, overrideRedirectUri) {
  const oauth2Client = createOAuth2Client(overrideRedirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  // Identify user
  if (!tokens.access_token) {
    throw new Error('Google OAuth did not return an access token');
  }

  const { email: userEmail, googleSubject } = await getUserInfo(tokens.access_token);
  if (!userEmail) {
    throw new Error('Could not determine user email from Google OAuth tokens');
  }

  // Upsert into users table — email is the stable identity key
  const userResult = await query(
    `INSERT INTO users (email, google_subject, last_login_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (email)
     DO UPDATE SET
       google_subject  = COALESCE($2, users.google_subject),
       last_login_at   = NOW()
     RETURNING id, email`,
    [userEmail, googleSubject]
  );
  const user = userResult.rows[0];
  const userId = user.id;

  // Store encrypted tokens in DB keyed by user_id
  try {
    if (tokens.refresh_token) {
      const { encrypted, iv, authTag } = encryptToken(tokens.refresh_token);
      await query(
        `INSERT INTO auth_tokens (user_id, user_email, token_type, encrypted_token, token_iv, token_auth_tag, updated_at)
         VALUES ($1, $2, 'google_refresh', $3, $4, $5, NOW())
         ON CONFLICT (user_id, token_type)
         DO UPDATE SET
           encrypted_token = $3,
           token_iv        = $4,
           token_auth_tag  = $5,
           updated_at      = NOW()`,
        [userId, userEmail, encrypted, iv, authTag]
      );
    }

    if (tokens.access_token) {
      const payload = JSON.stringify({
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date || null,
      });
      const { encrypted, iv, authTag } = encryptToken(payload);
      await query(
        `INSERT INTO auth_tokens (user_id, user_email, token_type, encrypted_token, token_iv, token_auth_tag, updated_at)
         VALUES ($1, $2, 'google_access', $3, $4, $5, NOW())
         ON CONFLICT (user_id, token_type)
         DO UPDATE SET
           encrypted_token = $3,
           token_iv        = $4,
           token_auth_tag  = $5,
           updated_at      = NOW()`,
        [userId, userEmail, encrypted, iv, authTag]
      );
    }

    console.log(`[Auth] Tokens stored (encrypted) for ${userEmail} (id=${userId})`);
  } catch (dbErr) {
    console.warn('[Auth] Failed to store tokens in DB:', dbErr.message);
  }

  return { tokens, user: { id: userId, email: userEmail } };
}

/**
 * Get an authenticated OAuth2 client for a specific user (by UUID).
 * Returns null if no token is stored.
 */
async function getAuthenticatedClient(userId) {
  if (!userId) {
    console.warn('[Auth] getAuthenticatedClient called without userId');
    return null;
  }

  let refreshToken = null;
  let accessToken = null;
  let tokenExpiry = null;

  try {
    const result = await query(
      `SELECT token_type, encrypted_token, token_iv, token_auth_tag
       FROM auth_tokens
       WHERE user_id = $1
         AND token_type IN ('google_refresh', 'google_access')`,
      [userId]
    );

    for (const row of result.rows) {
      try {
        const plaintext = decryptToken({
          encrypted: row.encrypted_token,
          iv: row.token_iv,
          authTag: row.token_auth_tag,
        });

        if (row.token_type === 'google_refresh') {
          refreshToken = plaintext;
        } else if (row.token_type === 'google_access') {
          const parsed = JSON.parse(plaintext);
          accessToken = parsed.access_token || null;
          tokenExpiry = parsed.expiry_date || null;
        }
      } catch (decryptErr) {
        console.warn(`[Auth] Failed to decrypt token (${row.token_type}) for user ${userId}:`, decryptErr.message);
      }
    }
  } catch (e) {
    console.warn('[Auth] DB query failed:', e.message);
  }

  if (!refreshToken && !accessToken) {
    console.warn(`[Auth] No OAuth token found for user ${userId}`);
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
      console.warn(`[Auth] Stored refresh token invalid for user ${userId}:`, err.message);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Clear stored OAuth tokens for a specific user (by UUID).
 */
async function clearAuthToken(userId) {
  if (!userId) return;
  try {
    await query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);
    console.log(`[Auth] Tokens cleared for user_id=${userId}`);
  } catch (e) {
    console.warn('[Auth] Failed to clear tokens:', e.message);
  }
}

/**
 * Get all users that have stored refresh tokens (for cron sync).
 * Returns array of { id, email }.
 */
async function getAllAuthenticatedUsers() {
  try {
    const result = await query(
      `SELECT u.id, u.email
       FROM users u
       INNER JOIN auth_tokens at ON at.user_id = u.id
       WHERE at.token_type = 'google_refresh'
         AND at.encrypted_token IS NOT NULL`
    );
    return result.rows;
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
  getUserInfo,
  getAllAuthenticatedUsers,
};
