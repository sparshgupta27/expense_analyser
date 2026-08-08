-- ============================================================
-- Gmail Expense Analyzer — Multi-User Account Isolation
-- Migration 003: Account Scoping & User Data Isolation
-- ============================================================

-- Add user_email column to core tables
ALTER TABLE raw_emails
  ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

ALTER TABLE auth_tokens
  ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

-- Backfill legacy rows with default email if NULL
UPDATE raw_emails
SET user_email = 'default_user@gmail.com'
WHERE user_email IS NULL;

UPDATE transactions
SET user_email = 'default_user@gmail.com'
WHERE user_email IS NULL;

UPDATE subscriptions
SET user_email = 'default_user@gmail.com'
WHERE user_email IS NULL;

UPDATE auth_tokens
SET user_email = 'default_user@gmail.com'
WHERE user_email IS NULL;

-- Indexes for fast multi-tenant query filtering
CREATE INDEX IF NOT EXISTS idx_raw_emails_user_email
  ON raw_emails(user_email);

CREATE INDEX IF NOT EXISTS idx_transactions_user_email
  ON transactions(user_email);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON transactions(user_email, transaction_date);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_email
  ON subscriptions(user_email);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_email
  ON auth_tokens(user_email);

-- Composite Unique Constraint for deduplication per user account
DROP INDEX IF EXISTS idx_transactions_dedupe;
DROP INDEX IF EXISTS idx_transactions_user_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_dedupe
  ON transactions(user_email, dedupe_hash);


CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_merchant
  ON subscriptions(user_email, merchant_normalized);

