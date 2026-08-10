/**
 * Token Encryption Utility — AES-256-GCM
 *
 * Provides envelope encryption for OAuth tokens stored in auth_tokens.
 * Each token gets its own random 12-byte IV and produces a 16-byte auth tag,
 * giving authenticated encryption (integrity + confidentiality).
 *
 * Env: TOKEN_ENCRYPTION_KEY — 64 hex characters (32 bytes)
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

function getKey() {
  const hexKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length < 64) {
    // In development without a key, use a deterministic dev key (not for production)
    if (process.env.NODE_ENV !== 'production') {
      return Buffer.from('0'.repeat(64), 'hex');
    }
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hexKey.slice(0, 64), 'hex');
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {{ encrypted: string, iv: string, authTag: string }}
 */
function encryptToken(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypt a previously encrypted token.
 * @param {{ encrypted: string, iv: string, authTag: string }} envelope
 * @returns {string} plaintext
 */
function decryptToken({ encrypted, iv, authTag }) {
  if (!encrypted || !iv || !authTag) {
    throw new Error('Invalid token envelope — missing encrypted, iv, or authTag');
  }

  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'), {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encryptToken, decryptToken };
