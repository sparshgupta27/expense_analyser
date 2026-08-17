-- 1. Fix auth_tokens.token_value NOT NULL constraint
ALTER TABLE auth_tokens ALTER COLUMN token_value DROP NOT NULL;
ALTER TABLE auth_tokens ALTER COLUMN token_value SET DEFAULT '';

-- 2. Drop partial unique indexes and recreate as standard unique constraints
DROP INDEX IF EXISTS uidx_raw_emails_user_msgid;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_raw_emails_user_msgid ON raw_emails(user_id, gmail_message_id);

DROP INDEX IF EXISTS uidx_transactions_user_msgid;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_transactions_user_msgid ON transactions(user_id, gmail_message_id);

DROP INDEX IF EXISTS uidx_merchant_profiles_user_name;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_merchant_profiles_user_name ON merchant_profiles(user_id, normalized_name);

DROP INDEX IF EXISTS uidx_category_overrides_user_txn;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_category_overrides_user_txn ON category_overrides(user_id, transaction_id);

DROP INDEX IF EXISTS uidx_subscriptions_user_merchant;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_subscriptions_user_merchant ON subscriptions(user_id, merchant_normalized);

DROP INDEX IF EXISTS uidx_auth_tokens_user_provider_type;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_auth_tokens_user_provider_type ON auth_tokens(user_id, provider, token_type);

DROP INDEX IF EXISTS uidx_sync_state_user;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_sync_state_user ON sync_state(user_id);

-- 3. Drop legacy foreign keys from migration 001
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_gmail_message_id_fkey;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_merchant_normalized_fkey;

-- 4. Clean up legacy NULL user_id rows
DELETE FROM sync_state WHERE user_id IS NULL;
