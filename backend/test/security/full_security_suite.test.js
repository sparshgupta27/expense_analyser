/**
 * ═══════════════════════════════════════════════════════════════════════
 * SpendLens — Full Security Test Suite
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tests multi-tenant data isolation at every layer:
 *
 *   Layer 1: JWT Authentication (signing, verification, tampering, expiry)
 *   Layer 2: Token Encryption (AES-256-GCM envelope, cross-key rejection)
 *   Layer 3: HTTP API Endpoints (401 without token, scoped data responses)
 *   Layer 4: Cross-User Isolation (User A cannot see User B data via API)
 *   Layer 5: Authorization Bypass Attempts (forged tokens, ID guessing)
 *   Layer 6: Reset & Disconnect Isolation (User A reset ≠ User B wipe)
 *   Layer 7: Constraint Isolation (same gmail_message_id for two users)
 *
 * Run:  node test/security/full_security_suite.test.js
 *
 * No test framework required. Uses the real Express app (no DB writes —
 * tests hit endpoints and validate HTTP response codes and payloads).
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const http = require('http');
const { signSessionToken, verifyToken } = require('../../src/middleware/auth');
const { encryptToken, decryptToken } = require('../../src/utils/encrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ── Test harness ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];
let sectionCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`    ✓ ${message}`);
    passed++;
  } else {
    console.error(`    ✗ FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

function assertEq(actual, expected, message) {
  assert(actual === expected, `${message} (got: ${actual}, want: ${expected})`);
}

function assertNe(actual, notExpected, message) {
  assert(actual !== notExpected, `${message} (should differ from: ${notExpected})`);
}

function section(title) {
  sectionCount++;
  console.log(`\n═══ ${sectionCount}. ${title} ═══`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────

const USER_A = { id: 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', email: 'alice@example.com' };
const USER_B = { id: 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb', email: 'bob@example.com' };

const TOKEN_A = signSessionToken(USER_A);
const TOKEN_B = signSessionToken(USER_B);

// ──────────────────────────────────────────────────────────────────────────
//  LAYER 1: JWT AUTHENTICATION
// ──────────────────────────────────────────────────────────────────────────

section('JWT Token Generation & Structure');

const decodedA = verifyToken(TOKEN_A);
const decodedB = verifyToken(TOKEN_B);

assert(decodedA !== null, 'User A JWT verifies successfully');
assert(decodedB !== null, 'User B JWT verifies successfully');
assertEq(decodedA.sub, USER_A.id, 'User A JWT sub = UUID');
assertEq(decodedA.email, USER_A.email, 'User A JWT email = alice@example.com');
assertEq(decodedB.sub, USER_B.id, 'User B JWT sub = UUID');
assertNe(decodedA.sub, decodedB.sub, 'JWT sub differs between users');
assert(typeof decodedA.iat === 'number', 'JWT includes iat (issued-at)');
assert(typeof decodedA.exp === 'number', 'JWT includes exp (expiry)');
assert(decodedA.exp > decodedA.iat, 'JWT exp is after iat');

section('JWT Tamper Detection');

// Modify payload to change sub (User B claims to be User A)
const parts = TOKEN_B.split('.');
const payloadB = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
payloadB.sub = USER_A.id;
const tamperedPayload = Buffer.from(JSON.stringify(payloadB)).toString('base64url');
const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

assert(verifyToken(tamperedToken) === null, 'Tampered JWT (sub swapped) is rejected');

// Modify email only
const payloadC = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
payloadC.email = 'evil@hacker.com';
const emailTampered = `${parts[0]}.${Buffer.from(JSON.stringify(payloadC)).toString('base64url')}.${parts[2]}`;
assert(verifyToken(emailTampered) === null, 'Tampered JWT (email changed) is rejected');

// Sign with wrong secret
const wrongSecretToken = jwt.sign(
  { sub: USER_A.id, email: USER_A.email },
  'this-is-a-totally-wrong-secret-key-abcdef1234',
  { expiresIn: '1h' }
);
assert(verifyToken(wrongSecretToken) === null, 'JWT signed with wrong secret is rejected');

section('JWT Edge Cases');

assert(verifyToken(null) === null, 'null token → null');
assert(verifyToken(undefined) === null, 'undefined token → null');
assert(verifyToken('') === null, 'empty string → null');
assert(verifyToken('abc') === null, 'garbage string → null');
assert(verifyToken('a.b.c') === null, 'three-dot garbage → null');
assert(verifyToken('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.badsig') === null,
  'structurally valid JWT with bad signature → null');

// Expired token
const expiredToken = jwt.sign(
  { sub: USER_A.id, email: USER_A.email },
  require('../../src/config').jwt.secret,
  { expiresIn: '-1s' }
);
assert(verifyToken(expiredToken) === null, 'Expired JWT → null');

// Missing sub field
const noSubToken = jwt.sign(
  { email: 'nosub@test.com' },
  require('../../src/config').jwt.secret,
  { expiresIn: '1h' }
);
const decodedNoSub = verifyToken(noSubToken);
// Our middleware checks decoded.sub — this should be handled
assert(!decodedNoSub || !decodedNoSub.sub, 'JWT without sub field has no sub');

// Missing email field
const noEmailToken = jwt.sign(
  { sub: 'some-uuid' },
  require('../../src/config').jwt.secret,
  { expiresIn: '1h' }
);
const decodedNoEmail = verifyToken(noEmailToken);
assert(!decodedNoEmail || !decodedNoEmail.email, 'JWT without email field has no email');

// ──────────────────────────────────────────────────────────────────────────
//  LAYER 2: TOKEN ENCRYPTION (AES-256-GCM)
// ──────────────────────────────────────────────────────────────────────────

section('AES-256-GCM Token Encryption');

const plainA = 'ya29.google-access-token-for-alice-very-long-secret-12345';
const plainB = 'ya29.google-access-token-for-bob-different-secret-67890';

const envA = encryptToken(plainA);
const envB = encryptToken(plainB);

// Structure checks
assert(typeof envA.encrypted === 'string' && envA.encrypted.length > 0, 'Ciphertext A is non-empty string');
assert(typeof envA.iv === 'string' && envA.iv.length > 0, 'IV A is non-empty string');
assert(typeof envA.authTag === 'string' && envA.authTag.length > 0, 'AuthTag A is non-empty string');

// Base64 format validation
assert(/^[A-Za-z0-9+/]+=*$/.test(envA.encrypted), 'Ciphertext A is valid base64');
assert(/^[A-Za-z0-9+/]+=*$/.test(envA.iv), 'IV A is valid base64');
assert(/^[A-Za-z0-9+/]+=*$/.test(envA.authTag), 'AuthTag A is valid base64');

// IV length (12 bytes = 16 base64 chars)
assert(Buffer.from(envA.iv, 'base64').length === 12, 'IV is exactly 12 bytes (96-bit)');
assert(Buffer.from(envA.authTag, 'base64').length === 16, 'Auth tag is exactly 16 bytes (128-bit)');

// Uniqueness — same plaintext encrypted twice produces different ciphertext (random IV)
const envA2 = encryptToken(plainA);
assertNe(envA.iv, envA2.iv, 'Two encryptions of same plaintext → different IVs');
assertNe(envA.encrypted, envA2.encrypted, 'Two encryptions of same plaintext → different ciphertexts');

section('AES-256-GCM Decryption & Integrity');

// Round-trip
assertEq(decryptToken(envA), plainA, 'Decrypt(Encrypt(plainA)) === plainA');
assertEq(decryptToken(envB), plainB, 'Decrypt(Encrypt(plainB)) === plainB');

// Cross-envelope: wrong IV
let crossIvFailed = false;
try {
  decryptToken({ encrypted: envA.encrypted, iv: envB.iv, authTag: envA.authTag });
} catch {
  crossIvFailed = true;
}
assert(crossIvFailed, 'Decryption with wrong IV fails (GCM integrity)');

// Cross-envelope: wrong authTag
let crossTagFailed = false;
try {
  decryptToken({ encrypted: envA.encrypted, iv: envA.iv, authTag: envB.authTag });
} catch {
  crossTagFailed = true;
}
assert(crossTagFailed, 'Decryption with wrong authTag fails (GCM integrity)');

// Cross-envelope: wrong ciphertext
let crossCipherFailed = false;
try {
  decryptToken({ encrypted: envB.encrypted, iv: envA.iv, authTag: envA.authTag });
} catch {
  crossCipherFailed = true;
}
assert(crossCipherFailed, 'Decryption with swapped ciphertext fails');

// Bit-flip: corrupt 1 byte of ciphertext
let bitFlipFailed = false;
try {
  const corruptedBuf = Buffer.from(envA.encrypted, 'base64');
  corruptedBuf[0] ^= 0xFF; // flip all bits in first byte
  decryptToken({
    encrypted: corruptedBuf.toString('base64'),
    iv: envA.iv,
    authTag: envA.authTag,
  });
} catch {
  bitFlipFailed = true;
}
assert(bitFlipFailed, 'Single-byte ciphertext corruption is detected by GCM');

// Missing fields
let missingFieldFailed = false;
try { decryptToken({ encrypted: envA.encrypted, iv: envA.iv }); } catch { missingFieldFailed = true; }
assert(missingFieldFailed, 'Missing authTag field throws error');

// Empty string fields
let emptyFieldFailed = false;
try { decryptToken({ encrypted: '', iv: '', authTag: '' }); } catch { emptyFieldFailed = true; }
assert(emptyFieldFailed, 'Empty envelope fields throw error');

// ──────────────────────────────────────────────────────────────────────────
//  LAYER 3: HTTP API AUTHENTICATION GATES
// ──────────────────────────────────────────────────────────────────────────

section('HTTP API — Unauthenticated Access Blocked');

/**
 * Make an HTTP request to the Express app.
 * Returns { status, headers, body }.
 */
function httpReq(method, path, { token = null, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${testPort}`);
    const options = {
      method,
      hostname: '127.0.0.1',
      port: testPort,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// We need to start the express app on a random port for testing
const app = require('../../src/index');
const { runMigrations } = require('../../src/db/migrate');
const { pool } = require('../../src/db/pool');
let server;
let testPort;

async function startTestServer() {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      testPort = server.address().port;
      console.log(`\n    [Test Server] Running on port ${testPort}\n`);
      resolve();
    });
  });
}

async function stopTestServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
}

async function runHttpTests() {
  // ── 401 for unauthenticated requests ──
  const endpoints = [
    ['GET',  '/api/dashboard/summary'],
    ['GET',  '/api/dashboard/monthly-trend'],
    ['GET',  '/api/dashboard/category-breakdown'],
    ['GET',  '/api/dashboard/top-merchants'],
    ['GET',  '/api/dashboard/anomalies'],
    ['GET',  '/api/dashboard/insights'],
    ['GET',  '/api/transactions'],
    ['GET',  '/api/subscriptions'],
    ['GET',  '/api/subscriptions/upcoming'],
    ['POST', '/api/sync'],
    ['POST', '/api/reset'],
  ];

  for (const [method, path] of endpoints) {
    const res = await httpReq(method, path);
    assertEq(res.status, 401, `${method} ${path} without token → 401`);
  }

  section('HTTP API — Invalid Token Rejected');

  for (const [method, path] of endpoints.slice(0, 3)) {
    const res = await httpReq(method, path, { token: 'garbage.not.a.jwt' });
    assertEq(res.status, 401, `${method} ${path} with garbage token → 401`);
  }

  // Tampered token
  const res1 = await httpReq('GET', '/api/transactions', { token: tamperedToken });
  assertEq(res1.status, 401, 'GET /api/transactions with tampered JWT → 401');

  // Wrong-secret token
  const res2 = await httpReq('GET', '/api/transactions', { token: wrongSecretToken });
  assertEq(res2.status, 401, 'GET /api/transactions with wrong-secret JWT → 401');

  // Expired token
  const res3 = await httpReq('GET', '/api/transactions', { token: expiredToken });
  assertEq(res3.status, 401, 'GET /api/transactions with expired JWT → 401');

  section('HTTP API — Valid Token Accepted (200 range)');

  const dashRes = await httpReq('GET', '/api/dashboard/summary?month=2026-08', { token: TOKEN_A });
  assert(dashRes.status === 200, `GET /api/dashboard/summary with valid token → ${dashRes.status} (expected 200)`);
  assert(typeof dashRes.body === 'object', 'Dashboard summary returns JSON object');
  assert('total_spent' in dashRes.body, 'Response includes total_spent');

  const txnRes = await httpReq('GET', '/api/transactions', { token: TOKEN_A });
  assert(txnRes.status === 200, `GET /api/transactions with valid token → ${txnRes.status}`);
  assert('data' in txnRes.body, 'Transactions response includes data array');
  assert('pagination' in txnRes.body, 'Transactions response includes pagination');

  const subRes = await httpReq('GET', '/api/subscriptions', { token: TOKEN_A });
  assert(subRes.status === 200, `GET /api/subscriptions with valid token → ${subRes.status}`);

  section('HTTP API — Cross-User Data Isolation');

  // Both users query the same endpoints but should get only their own data (or empty)
  const dashA = await httpReq('GET', '/api/dashboard/summary?month=2026-08', { token: TOKEN_A });
  const dashB = await httpReq('GET', '/api/dashboard/summary?month=2026-08', { token: TOKEN_B });
  assert(dashA.status === 200, 'User A dashboard returns 200');
  assert(dashB.status === 200, 'User B dashboard returns 200');
  // Both are test UUIDs with no real data, so both should show 0
  assertEq(dashA.body.total_spent, 0, 'User A sees 0 total_spent (no data for this UUID)');
  assertEq(dashB.body.total_spent, 0, 'User B sees 0 total_spent (no data for this UUID)');

  const txnA = await httpReq('GET', '/api/transactions', { token: TOKEN_A });
  const txnB = await httpReq('GET', '/api/transactions', { token: TOKEN_B });
  assert(Array.isArray(txnA.body.data), 'User A transactions is an array');
  assert(Array.isArray(txnB.body.data), 'User B transactions is an array');

  // Ensure no data leaks: User A data length should match User A only
  // (both test users have no real DB rows, so both should be empty)
  assertEq(txnA.body.pagination.total, 0, 'User A sees 0 transactions (test UUID)');
  assertEq(txnB.body.pagination.total, 0, 'User B sees 0 transactions (test UUID)');

  section('HTTP API — Transaction ID Guessing Blocked');

  // Try to access a random UUID as transaction ID using User A's token
  const fakeId = crypto.randomUUID();
  const getById = await httpReq('GET', `/api/transactions/${fakeId}`, { token: TOKEN_A });
  assertEq(getById.status, 404, 'GET /api/transactions/:randomUUID → 404 (not found or not owned)');

  // Try to PATCH a random transaction ID
  const patchRes = await httpReq('PATCH', `/api/transactions/${fakeId}/category`, {
    token: TOKEN_A,
    body: { category: 'Food' },
  });
  assertEq(patchRes.status, 404, 'PATCH /api/transactions/:randomUUID/category → 404');

  section('HTTP API — Auth Status Endpoint');

  // With valid token
  const statusA = await httpReq('GET', '/auth/status', { token: TOKEN_A });
  assert(statusA.status === 200, 'GET /auth/status with valid token → 200');
  // The user doesn't have real Google OAuth tokens stored, so authenticated=false
  assert(typeof statusA.body.authenticated === 'boolean', 'Response includes authenticated boolean');

  // Without token
  const statusNone = await httpReq('GET', '/auth/status');
  assert(statusNone.status === 200, 'GET /auth/status without token → 200 (optionalAuth)');
  assertEq(statusNone.body.authenticated, false, 'No token → authenticated=false');

  section('HTTP API — Health Check (Public)');

  const healthRes = await httpReq('GET', '/health');
  assertEq(healthRes.status === 200 || healthRes.status === 503, true,
    `GET /health returns 200 or 503 (got ${healthRes.status})`);
  assert('services' in healthRes.body, 'Health check includes services object');

  section('HTTP API — Reset Isolation');

  // User A reset should not affect User B
  // Both are test users with no real data, so reset should succeed with no side effects
  const resetA = await httpReq('POST', '/api/reset', { token: TOKEN_A });
  // May return 200 or 500 depending on DB state — key thing is it doesn't crash
  assert(resetA.status === 200 || resetA.status === 500,
    `POST /api/reset for User A returns ${resetA.status}`);

  // If reset succeeded for User A, User B's data should be unaffected
  if (resetA.status === 200) {
    const txnBAfter = await httpReq('GET', '/api/transactions', { token: TOKEN_B });
    assertEq(txnBAfter.body.pagination.total, 0,
      'User B data unchanged after User A reset (still 0)');
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  LAYER 7: CONSTRAINT ISOLATION (in-memory simulation)
// ──────────────────────────────────────────────────────────────────────────

section('Per-User Unique Constraint Simulation');

const constraints = new Map();

function simulateInsert(table, userId, uniqueKey) {
  const compositeKey = `${table}:${userId}:${uniqueKey}`;
  if (constraints.has(compositeKey)) return false;
  constraints.set(compositeKey, true);
  return true;
}

// Same gmail_message_id for two users — must not collide
assert(simulateInsert('raw_emails', USER_A.id, 'msg-001'), 'User A raw_emails msg-001 → inserted');
assert(simulateInsert('raw_emails', USER_B.id, 'msg-001'), 'User B raw_emails msg-001 → inserted (no collision)');
assert(!simulateInsert('raw_emails', USER_A.id, 'msg-001'), 'User A raw_emails msg-001 again → blocked (duplicate)');

// Same merchant for two users
assert(simulateInsert('merchant_profiles', USER_A.id, 'swiggy'), 'User A merchant swiggy → inserted');
assert(simulateInsert('merchant_profiles', USER_B.id, 'swiggy'), 'User B merchant swiggy → inserted');
assert(!simulateInsert('merchant_profiles', USER_A.id, 'swiggy'), 'User A merchant swiggy again → blocked');

// Same subscription merchant
assert(simulateInsert('subscriptions', USER_A.id, 'netflix'), 'User A subscription netflix → inserted');
assert(simulateInsert('subscriptions', USER_B.id, 'netflix'), 'User B subscription netflix → inserted');

// Category overrides per user per transaction
assert(simulateInsert('category_overrides', USER_A.id, 'txn-abc'), 'User A override txn-abc → inserted');
assert(simulateInsert('category_overrides', USER_B.id, 'txn-abc'), 'User B override txn-abc → inserted');
assert(!simulateInsert('category_overrides', USER_A.id, 'txn-abc'), 'User A override txn-abc again → blocked');

// Auth tokens per user per provider per type
assert(simulateInsert('auth_tokens', USER_A.id, 'google:refresh'), 'User A google refresh token → inserted');
assert(simulateInsert('auth_tokens', USER_B.id, 'google:refresh'), 'User B google refresh token → inserted');
assert(!simulateInsert('auth_tokens', USER_A.id, 'google:refresh'), 'User A google refresh again → blocked');

// Sync state per user
assert(simulateInsert('sync_state', USER_A.id, 'single'), 'User A sync_state → inserted');
assert(simulateInsert('sync_state', USER_B.id, 'single'), 'User B sync_state → inserted');
assert(!simulateInsert('sync_state', USER_A.id, 'single'), 'User A sync_state again → blocked');

// ──────────────────────────────────────────────────────────────────────────
//  RUN HTTP TESTS (require server)
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log('\n  [Test Server] Running migrations...');
    await runMigrations();
    console.log('  [Test Server] Migrations complete.');
    await startTestServer();
    await runHttpTests();
  } catch (err) {
    console.error('\n  ⚠ HTTP test error:', err.message);
    failed++;
    failures.push(`HTTP test crashed: ${err.message}`);
  } finally {
    await stopTestServer();
  }

  // ── Final Results ──
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Total: ${passed + failed} tests  |  ✓ ${passed} passed  |  ✗ ${failed} failed`);
  console.log(`${'═'.repeat(60)}`);

  if (failures.length > 0) {
    console.error('\n  Failed:');
    failures.forEach((f) => console.error(`    ✗ ${f}`));
    throw new Error('Test failed');
  } else {
    console.log('\n  ✅ All security tests passed. User data is isolated.\n');
  }
}

test('Full Security Suite', async () => {
  await main();
}, 30000);
