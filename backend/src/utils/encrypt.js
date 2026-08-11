/**
 * Token Encryption Utility — AES-256-GCM
 *
 * Provides envelope encryption for OAuth tokens stored in auth_tokens.
 * Each token gets its own random 12-byte IV and produces a 16-byte auth tag,
 * giving authenticated encryption (integrity + confidentiality).
 *
 * Env: TOKEN_ENCRYPTION_KEY — base64-encoded 32-byte key.
 * Generate:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Previous implementations used hex encoding. base64 is now used:
 * - Matches the spec and industry convention for key material
 * - 43 chars vs 64 chars for the same 32 bytes
 * - Consistent with AWS KMS / GCP KMS key format
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

function getKey() {
  const b64Key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64Key) {
    if (process.env.NODE_ENV !== 'production') {
      // Deterministic dev key — 32 zero bytes in base64
      return Buffer.alloc(32, 0);
    }
    throw new Error('TOKEN_ENCRYPTION_KEY must be set to a base64-encoded 32-byte value');
  }
  const key = Buffer.from(b64Key, 'base64');
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY decoded to ${key.length} bytes; expected 32`);
  }
  return key;
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {{ encrypted: string, iv: string, authTag: string }} — all base64 encoded
 */
function encryptToken(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt a previously encrypted token.
 * @param {{ encrypted: string, iv: string, authTag: string }} envelope — all base64 encoded
 * @returns {string} plaintext
 */
function decryptToken({ encrypted, iv, authTag }) {
  if (!encrypted || !iv || !authTag) {
    throw new Error('Invalid token envelope — missing encrypted, iv, or authTag');
  }

  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64'),
    { authTagLength: TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encryptToken, decryptToken };
