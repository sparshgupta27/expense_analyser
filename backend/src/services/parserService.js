/**
 * Parser Service — Kafka Consumer
 *
 * Consumes messages from "raw-emails" topic, runs them through the
 * parser registry, normalizes merchant names, categorizes, computes
 * dedupe hash, and inserts into the transactions table.
 */

const crypto = require('crypto');
const config = require('../config');
const { query } = require('../db/pool');
const { consumer, connectConsumer } = require('./kafka');
const { parse } = require('../parsers');
const { normalize } = require('./merchantNormalizer');
const { categorize } = require('./categorizer');

/**
 * Compute dedupe hash: SHA256(amount + merchant_normalized + date_bucket)
 * Date is bucketed into 5-minute windows to catch near-duplicate transactions.
 */
function computeDedupeHash(amount, merchantNormalized, transactionDate) {
  const bucketMs = config.dedupe.timeBucketMinutes * 60 * 1000;
  const dateBucket = new Date(
    Math.floor(transactionDate.getTime() / bucketMs) * bucketMs
  ).toISOString();

  return crypto
    .createHash('sha256')
    .update(`${amount}|${merchantNormalized}|${dateBucket}`)
    .digest('hex');
}

/**
 * Upsert merchant profile — update stats on every new transaction.
 */
async function upsertMerchantProfile(merchantNormalized, amount, category) {
  await query(
    `INSERT INTO merchant_profiles
       (normalized_name, display_name, category, avg_transaction_amount,
        transaction_count, first_seen_at, last_seen_at)
     VALUES ($1, $1, $2, $3, 1, NOW(), NOW())
     ON CONFLICT (normalized_name) DO UPDATE SET
       category = COALESCE(NULLIF(merchant_profiles.category, 'Other'), $2),
       avg_transaction_amount = (
         (merchant_profiles.avg_transaction_amount * merchant_profiles.transaction_count + $3)
         / (merchant_profiles.transaction_count + 1)
       ),
       transaction_count = merchant_profiles.transaction_count + 1,
       last_seen_at = NOW()`,
    [merchantNormalized, category, amount]
  );
}

/**
 * Process a single email message from Kafka.
 */
async function processMessage(messageData) {
  const { gmail_message_id, sender, subject, body } = messageData;

  // Run through parser registry
  const parseResult = parse(sender, subject, body);

  if (!parseResult) {
    // No parser matched — leave raw_email.processed = false for LLM batch
    console.log(`[ParserService] No parser match for ${gmail_message_id} from ${sender}`);
    return { status: 'unmatched', gmail_message_id };
  }

  const {
    amount,
    merchant_raw,
    transaction_type,
    transaction_date,
    account_last4,
    confidence,
    parser,
  } = parseResult;

  // Normalize merchant name
  const merchantNormalized = normalize(merchant_raw);

  // Categorize
  const category = await categorize(merchantNormalized);

  // Compute dedupe hash
  const dedupeHash = computeDedupeHash(amount, merchantNormalized, transaction_date);

  // Check for cross-email duplicate (same transaction from bank alert + merchant email)
  const dupeCheck = await query(
    `SELECT id FROM transactions WHERE dedupe_hash = $1 AND gmail_message_id != $2`,
    [dedupeHash, gmail_message_id]
  );

  if (dupeCheck.rows.length > 0) {
    console.log(
      `[ParserService] Cross-email duplicate detected for ${gmail_message_id} ` +
      `(matches transaction ${dupeCheck.rows[0].id})`
    );
    // Still mark raw email as processed
    await query(
      'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1',
      [gmail_message_id]
    );
    return { status: 'duplicate', gmail_message_id };
  }

  // Insert transaction (idempotent via ON CONFLICT)
  try {
    await query(
      `INSERT INTO transactions
         (gmail_message_id, amount, merchant_raw, merchant_normalized, category,
          transaction_type, transaction_date, parse_confidence, dedupe_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (gmail_message_id) DO NOTHING`,
      [
        gmail_message_id, amount, merchant_raw, merchantNormalized, category,
        transaction_type, transaction_date, confidence, dedupeHash,
      ]
    );

    // Update merchant profile
    await upsertMerchantProfile(merchantNormalized, amount, category);

    // Mark raw email as processed
    await query(
      'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1',
      [gmail_message_id]
    );

    console.log(
      `[ParserService] Parsed ${gmail_message_id}: ${transaction_type} ₹${amount} ` +
      `at ${merchantNormalized} [${category}] via ${parser} (conf: ${confidence})`
    );

    return { status: 'parsed', gmail_message_id, amount, merchantNormalized, category };
  } catch (err) {
    console.error(`[ParserService] Error inserting transaction for ${gmail_message_id}:`, err.message);
    return { status: 'error', gmail_message_id, error: err.message };
  }
}

/**
 * Start the Kafka consumer to process raw emails.
 */
async function startParserConsumer() {
  try {
    await connectConsumer();

    await consumer.subscribe({
      topic: config.kafka.topics.rawEmails,
      fromBeginning: true,
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageData = JSON.parse(message.value.toString());
          await processMessage(messageData);
        } catch (err) {
          console.error('[ParserService] Error processing Kafka message:', err.message);
        }
      },
    });

    console.log('[ParserService] Kafka consumer started, listening for raw emails');
  } catch (err) {
    console.log('[ParserService] Kafka offline — parser consumer waiting for Kafka container.');
  }
}

module.exports = { startParserConsumer, processMessage, computeDedupeHash };
