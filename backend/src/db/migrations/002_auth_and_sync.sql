-- ============================================================
-- Gmail Expense Analyzer — Auth & Sync State
-- Migration 002: OAuth tokens and sync tracking
-- ============================================================

-- OAuth token storage
CREATE TABLE IF NOT EXISTS auth_tokens (
  id SERIAL PRIMARY KEY,
  token_type VARCHAR(50) UNIQUE NOT NULL,
  token_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sync state (single-row table tracking Gmail history position)
CREATE TABLE IF NOT EXISTS sync_state (
  id SERIAL PRIMARY KEY,
  history_id VARCHAR(50),
  last_sync_at TIMESTAMP,
  emails_fetched INT DEFAULT 0
);

-- Insert initial sync state row
INSERT INTO sync_state (history_id, last_sync_at, emails_fetched)
VALUES (NULL, NULL, 0)
ON CONFLICT DO NOTHING;

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP DEFAULT NOW()
);
