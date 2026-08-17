-- ============================================================
-- SpendLens — Security Hardening
-- Migration 005: WITH CHECK on RLS, users profile columns,
--   provider column on auth_tokens, NOT NULL user_id,
--   audit_events table, UNIQUE(user_id) on sync_state.
-- ============================================================

-- ============================================================
-- 1. Extend users table with profile fields
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMP DEFAULT NOW();

-- ============================================================
-- 2. Add provider column to auth_tokens (future: GitHub, Apple…)
-- ============================================================
ALTER TABLE auth_tokens
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'google';

-- Rebuild the per-user token unique index to include provider
DROP INDEX IF EXISTS uidx_auth_tokens_user_type;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_auth_tokens_user_provider_type
  ON auth_tokens(user_id, provider, token_type)
  WHERE user_id IS NOT NULL;

-- ============================================================
-- 3. Enforce NOT NULL on user_id — all backfilled rows must
--    have a valid user_id before this runs. Orphaned rows are deleted.
-- ============================================================
DELETE FROM auth_tokens WHERE user_id IS NULL;
DELETE FROM raw_emails WHERE user_id IS NULL;
DELETE FROM transactions WHERE user_id IS NULL;
DELETE FROM merchant_profiles WHERE user_id IS NULL;
DELETE FROM subscriptions WHERE user_id IS NULL;
DELETE FROM category_overrides WHERE user_id IS NULL;
DELETE FROM sync_state WHERE user_id IS NULL;

ALTER TABLE auth_tokens        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE raw_emails         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE transactions        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE merchant_profiles   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE subscriptions       ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE category_overrides  ALTER COLUMN user_id SET NOT NULL;
-- sync_state is per-user; each user has one row
ALTER TABLE sync_state          ALTER COLUMN user_id SET NOT NULL;

-- Enforce unique sync_state per user
CREATE UNIQUE INDEX IF NOT EXISTS uidx_sync_state_user
  ON sync_state(user_id);

-- ============================================================
-- 4. Rebuild RLS policies — add WITH CHECK to block rogue INSERTs
--    Previous policies only had USING (reads). WITH CHECK blocks
--    inserts/updates that would set user_id to another user's ID.
-- ============================================================
DROP POLICY IF EXISTS user_isolation ON raw_emails;
DROP POLICY IF EXISTS user_isolation ON transactions;
DROP POLICY IF EXISTS user_isolation ON merchant_profiles;
DROP POLICY IF EXISTS user_isolation ON subscriptions;
DROP POLICY IF EXISTS user_isolation ON category_overrides;
DROP POLICY IF EXISTS user_isolation ON auth_tokens;
DROP POLICY IF EXISTS user_isolation ON sync_state;

-- Helper expression used in every policy:
--   '' means no user context set (migration/cron bypass)
--   Otherwise must match exactly

CREATE POLICY user_isolation ON raw_emails
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON transactions
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON merchant_profiles
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON subscriptions
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON category_overrides
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON auth_tokens
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY user_isolation ON sync_state
  USING (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) = ''
    OR user_id::text = current_setting('app.current_user_id', true)
  );

-- ============================================================
-- 5. Audit events table — tracks security-relevant actions
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Fast queries: all events for a user, all events of a type
CREATE INDEX IF NOT EXISTS idx_audit_user_id  ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_events(created_at DESC);
