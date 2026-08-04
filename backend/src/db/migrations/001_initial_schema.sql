-- ============================================================
-- Gmail Expense Analyzer — Initial Schema
-- Migration 001: Core tables
-- ============================================================

-- Raw emails staging table
CREATE TABLE IF NOT EXISTS raw_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id VARCHAR(255) UNIQUE NOT NULL,
  sender VARCHAR(255),
  subject TEXT,
  body TEXT,
  received_at TIMESTAMP,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transactions (parsed from raw emails)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id VARCHAR(255) UNIQUE NOT NULL REFERENCES raw_emails(gmail_message_id),
  amount DECIMAL(12,2) NOT NULL,
  merchant_raw VARCHAR(500),
  merchant_normalized VARCHAR(255),
  category VARCHAR(100) DEFAULT 'Other',
  transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('debit', 'credit')),
  transaction_date TIMESTAMP,
  parse_confidence DECIMAL(3,2) DEFAULT 1.0,
  dedupe_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Manual category overrides (never overwritten by re-parsing)
CREATE TABLE IF NOT EXISTS category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(transaction_id)
);

-- Merchant profiles (built up from transaction data)
CREATE TABLE IF NOT EXISTS merchant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255),
  category VARCHAR(100) DEFAULT 'Other',
  is_subscription BOOLEAN DEFAULT false,
  avg_transaction_amount DECIMAL(12,2) DEFAULT 0,
  transaction_count INT DEFAULT 0,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP
);

-- Detected subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_normalized VARCHAR(255) NOT NULL REFERENCES merchant_profiles(normalized_name),
  current_amount DECIMAL(12,2),
  previous_amount DECIMAL(12,2),
  interval_days INT,
  next_expected_date DATE,
  last_charged_date DATE,
  price_change_flag BOOLEAN DEFAULT false,
  ghost_flag BOOLEAN DEFAULT false,
  confidence DECIMAL(3,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW(),
  last_detected_at TIMESTAMP
);

-- Category rules (for fuzzy matching merchants to categories)
CREATE TABLE IF NOT EXISTS category_rules (
  id SERIAL PRIMARY KEY,
  pattern VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Indexes for query performance
-- ============================================================

-- Raw emails: find unprocessed emails quickly
CREATE INDEX IF NOT EXISTS idx_raw_emails_unprocessed
  ON raw_emails(processed) WHERE NOT processed;

-- Transactions: common query patterns
CREATE INDEX IF NOT EXISTS idx_transactions_date
  ON transactions(transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions(category);

CREATE INDEX IF NOT EXISTS idx_transactions_merchant
  ON transactions(merchant_normalized);

CREATE INDEX IF NOT EXISTS idx_transactions_dedupe
  ON transactions(dedupe_hash);

-- Subscriptions: upcoming renewals
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_date
  ON subscriptions(next_expected_date);
