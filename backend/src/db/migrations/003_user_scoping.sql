-- ============================================================
-- Gmail Expense Analyzer — Per-User Scoping
-- Migration 003: Add user_email to all data tables for multi-user isolation
-- ============================================================

-- Add user_email column to data tables
ALTER TABLE raw_emails ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE merchant_profiles ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE category_overrides ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

-- Add user_email to auth_tokens for per-user token storage
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

-- Drop old unique constraint on token_type (single-user model)
ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_token_type_key;

-- Create composite unique index (user_email + token_type) for multi-user tokens
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_tokens_user_type
  ON auth_tokens(user_email, token_type);

-- Performance indexes for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_raw_emails_user ON raw_emails(user_email);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_email);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_email, transaction_date);
CREATE INDEX IF NOT EXISTS idx_merchant_profiles_user ON merchant_profiles(user_email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_category_overrides_user ON category_overrides(user_email);
