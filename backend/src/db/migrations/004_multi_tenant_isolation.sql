-- ============================================================
-- Gmail Expense Analyzer — True Multi-Tenant Isolation
-- Migration 004: users table, UUID foreign keys, per-user
--   unique constraints, encrypted token columns, RLS policies.
-- ============================================================

-- Enable CITEXT extension for case-insensitive email matching
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- 1. Canonical users table
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  google_subject  TEXT UNIQUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  last_login_at   TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 2. Backfill users from all distinct user_email values
-- ============================================================
INSERT INTO users (email)
SELECT DISTINCT user_email
FROM auth_tokens
WHERE user_email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- Also catch any emails that exist only in other tables
INSERT INTO users (email)
SELECT DISTINCT user_email FROM raw_emails         WHERE user_email IS NOT NULL ON CONFLICT (email) DO NOTHING;
INSERT INTO users (email)
SELECT DISTINCT user_email FROM transactions       WHERE user_email IS NOT NULL ON CONFLICT (email) DO NOTHING;
INSERT INTO users (email)
SELECT DISTINCT user_email FROM merchant_profiles  WHERE user_email IS NOT NULL ON CONFLICT (email) DO NOTHING;
INSERT INTO users (email)
SELECT DISTINCT user_email FROM subscriptions      WHERE user_email IS NOT NULL ON CONFLICT (email) DO NOTHING;
INSERT INTO users (email)
SELECT DISTINCT user_email FROM category_overrides WHERE user_email IS NOT NULL ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 3. Add user_id UUID columns (nullable for safe backfill)
-- ============================================================
ALTER TABLE auth_tokens        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE raw_emails         ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transactions       ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE merchant_profiles  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE subscriptions      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE category_overrides ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sync_state         ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================
-- 4. Backfill user_id from user_email via JOIN
-- ============================================================
UPDATE auth_tokens        SET user_id = u.id FROM users u WHERE LOWER(u.email) = LOWER(auth_tokens.user_email)        AND auth_tokens.user_id IS NULL;
UPDATE raw_emails         SET user_id = u.id FROM users u WHERE LOWER(u.email) = LOWER(raw_emails.user_email)         AND raw_emails.user_id IS NULL;
UPDATE transactions       SET user_id = u.id FROM users u WHERE LOWER(u.email) = LOWER(transactions.user_email)       AND transactions.user_id IS NULL;
UPDATE merchant_profiles  SET user_id = u.id FROM users u WHERE LOWER(u.email) = LOWER(merchant_profiles.user_email)  AND merchant_profiles.user_id IS NULL;
UPDATE subscriptions      SET user_id = u.id FROM users u WHERE LOWER(u.email) = LOWER(subscriptions.user_email)      AND subscriptions.user_id IS NULL;
UPDATE category_overrides SET user_id = u.id FROM users u WHERE LOWER(u.email) = LOWER(category_overrides.user_email) AND category_overrides.user_id IS NULL;

-- ============================================================
-- 5. Add encrypted token columns to auth_tokens
-- ============================================================
ALTER TABLE auth_tokens
  ADD COLUMN IF NOT EXISTS encrypted_token TEXT,
  ADD COLUMN IF NOT EXISTS token_iv        TEXT,
  ADD COLUMN IF NOT EXISTS token_auth_tag  TEXT;

-- ============================================================
-- 6. Drop old global unique constraints (cause cross-user collisions)
-- ============================================================
-- First drop foreign keys that depend on the unique constraints
ALTER TABLE transactions       DROP CONSTRAINT IF EXISTS transactions_gmail_message_id_fkey;
ALTER TABLE subscriptions      DROP CONSTRAINT IF EXISTS subscriptions_merchant_normalized_fkey;
ALTER TABLE raw_emails         DROP CONSTRAINT IF EXISTS raw_emails_gmail_message_id_key;
ALTER TABLE transactions       DROP CONSTRAINT IF EXISTS transactions_gmail_message_id_key;
ALTER TABLE merchant_profiles  DROP CONSTRAINT IF EXISTS merchant_profiles_normalized_name_key;
ALTER TABLE category_overrides DROP CONSTRAINT IF EXISTS category_overrides_transaction_id_key;
-- Also drop old auth_tokens unique constraint if present
DROP INDEX IF EXISTS idx_auth_tokens_user_type;
ALTER TABLE auth_tokens        DROP CONSTRAINT IF EXISTS auth_tokens_token_type_key;

-- Also drop old subscriptions constraint added dynamically by subscriptionDetector
ALTER TABLE subscriptions      DROP CONSTRAINT IF EXISTS subscriptions_user_merchant_unique;
DROP INDEX IF EXISTS idx_subscriptions_user_merchant;

-- ============================================================
-- 7. Add per-user scoped unique indexes (the real tenant boundaries)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uidx_raw_emails_user_msgid
  ON raw_emails(user_id, gmail_message_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_transactions_user_msgid
  ON transactions(user_id, gmail_message_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_merchant_profiles_user_name
  ON merchant_profiles(user_id, normalized_name)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_category_overrides_user_txn
  ON category_overrides(user_id, transaction_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_auth_tokens_user_type
  ON auth_tokens(user_id, token_type)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_subscriptions_user_merchant
  ON subscriptions(user_id, merchant_normalized)
  WHERE user_id IS NOT NULL;

-- ============================================================
-- 8. Per-user sync_state rows (was single global row)
-- ============================================================
INSERT INTO sync_state (user_id, history_id, last_sync_at, emails_fetched)
SELECT id, NULL, NULL, 0 FROM users
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. Performance indexes on user_id columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_raw_emails_uid         ON raw_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_uid        ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_uid_date   ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_uid   ON merchant_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_uid       ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_category_overrides_uid  ON category_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_uid         ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_uid          ON sync_state(user_id);

-- ============================================================
-- 10. Enable Row Level Security on all user-owned tables
-- ============================================================
ALTER TABLE raw_emails         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state         ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (prevents accidental bypasses)
ALTER TABLE raw_emails         FORCE ROW LEVEL SECURITY;
ALTER TABLE transactions       FORCE ROW LEVEL SECURITY;
ALTER TABLE merchant_profiles  FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      FORCE ROW LEVEL SECURITY;
ALTER TABLE category_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens        FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_state         FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 11. RLS policies — reads/writes only allowed for the session user
--     Backend sets: SET LOCAL app.current_user_id = '<uuid>'
--     The true() fallback lets migrations/cron bypass safely when
--     the setting is absent (e.g. during this migration itself)
-- ============================================================
DROP POLICY IF EXISTS user_isolation ON raw_emails;
DROP POLICY IF EXISTS user_isolation ON transactions;
DROP POLICY IF EXISTS user_isolation ON merchant_profiles;
DROP POLICY IF EXISTS user_isolation ON subscriptions;
DROP POLICY IF EXISTS user_isolation ON category_overrides;
DROP POLICY IF EXISTS user_isolation ON auth_tokens;
DROP POLICY IF EXISTS user_isolation ON sync_state;

CREATE POLICY user_isolation ON raw_emails
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON transactions
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON merchant_profiles
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON subscriptions
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON category_overrides
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON auth_tokens
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON sync_state
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );
