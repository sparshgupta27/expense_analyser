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
 * Fetch user info from Google using tokens and OAuth2 client.
 * Tries id_token payload, OAuth2 userinfo API, and Gmail getProfile fallback.
 * Returns { email, googleSubject, displayName, avatarUrl }.
 */
async function getUserInfo(tokens, oauth2Client) {
  let email = null;
  let googleSubject = null;
  let displayName = null;
  let avatarUrl = null;

  // 1. Extract from id_token if provided by Google
  if (tokens.id_token) {
    try {
      const parts = tokens.id_token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (payload.email) email = payload.email;
        if (payload.sub) googleSubject = payload.sub;
        if (payload.name) displayName = payload.name;
        if (payload.picture) avatarUrl = payload.picture;
      }
    } catch (e) {}
  }

  // 2. Try Google OAuth2 userinfo endpoint
  if (!email && tokens.access_token) {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const res = await oauth2.userinfo.get();
      if (res?.data) {
        email = res.data.email || email;
        googleSubject = res.data.id || googleSubject;
        displayName = res.data.name || displayName;
        avatarUrl = res.data.picture || avatarUrl;
      }
    } catch (e) {
      console.warn('[Auth] oauth2.userinfo.get failed:', e.message);
    }
  }

  // 3. Fallback: Gmail API getProfile (guaranteed since gmail.readonly is granted)
  if (!email && oauth2Client) {
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      if (profile?.data?.emailAddress) {
        email = profile.data.emailAddress;
      }
    } catch (e) {
      console.warn('[Auth] gmail.users.getProfile fallback failed:', e.message);
    }
  }

  return { email, googleSubject, displayName, avatarUrl };
}

/**
 * Exchange authorization code for tokens, upsert the user into the users table,
 * and store encrypted OAuth tokens keyed by user_id (UUID).
 *
 * @returns {{ user: { id: string, email: string, displayName: string, avatarUrl: string } }}
 */
async function handleCallback(code, overrideRedirectUri) {
  const oauth2Client = createOAuth2Client(overrideRedirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('Google OAuth did not return an access token');
  }

  oauth2Client.setCredentials(tokens);

  const { email: userEmail, googleSubject, displayName, avatarUrl } = await getUserInfo(tokens, oauth2Client);
  if (!userEmail) {
    throw new Error('Could not determine user email from Google OAuth tokens');
  }

  // Upsert user — conflict on unique email
  const userResult = await query(
    `INSERT INTO users (email, google_subject, display_name, avatar_url, last_login_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (email)
     DO UPDATE SET
       google_subject = COALESCE(EXCLUDED.google_subject, users.google_subject),
       display_name   = COALESCE(EXCLUDED.display_name, users.display_name),
       avatar_url     = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
       last_login_at  = NOW(),
       updated_at     = NOW()
     RETURNING id, email, display_name, avatar_url`,
    [userEmail, googleSubject, displayName, avatarUrl]
  );
  const user = userResult.rows[0];
  const userId = user.id;

  // Store encrypted Google tokens keyed by (user_id, provider, token_type)
  try {
    if (tokens.refresh_token) {
      const { encrypted, iv, authTag } = encryptToken(tokens.refresh_token);
      await query(
        `INSERT INTO auth_tokens
           (user_id, user_email, provider, token_type, token_value, encrypted_token, token_iv, token_auth_tag, updated_at)
         VALUES ($1, $2, 'google', 'refresh', 'encrypted', $3, $4, $5, NOW())
         ON CONFLICT (user_id, provider, token_type)
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
        `INSERT INTO auth_tokens
           (user_id, user_email, provider, token_type, token_value, encrypted_token, token_iv, token_auth_tag, updated_at)
         VALUES ($1, $2, 'google', 'access', 'encrypted', $3, $4, $5, NOW())
         ON CONFLICT (user_id, provider, token_type)
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

  return {
    tokens,
    user: {
      id: userId,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    },
  };
}

/**
 * Get an authenticated OAuth2 client for a specific user (by UUID).
 * Decrypts stored tokens. Returns null if no token exists.
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
         AND provider = 'google'
         AND token_type IN ('refresh', 'access')`,
      [userId]
    );

    for (const row of result.rows) {
      try {
        const plaintext = decryptToken({
          encrypted: row.encrypted_token,
          iv: row.token_iv,
          authTag: row.token_auth_tag,
        });

        if (row.token_type === 'refresh') {
          refreshToken = plaintext;
        } else if (row.token_type === 'access') {
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
 * Clear stored Google OAuth tokens for a specific user (by UUID).
 */
async function clearAuthToken(userId) {
  if (!userId) return;
  try {
    await query(
      "DELETE FROM auth_tokens WHERE user_id = $1 AND provider = 'google'",
      [userId]
    );
    console.log(`[Auth] Google tokens cleared for user_id=${userId}`);
  } catch (e) {
    console.warn('[Auth] Failed to clear tokens:', e.message);
  }
}

/**
 * Get all users with valid Google refresh tokens (for cron sync).
 * Returns array of { id, email }.
 */
async function getAllAuthenticatedUsers() {
  try {
    const result = await query(
      `SELECT DISTINCT u.id, u.email
       FROM users u
       INNER JOIN auth_tokens t ON t.user_id = u.id
       WHERE t.provider = 'google'
         AND t.token_type = 'refresh'
         AND t.encrypted_token IS NOT NULL`
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
