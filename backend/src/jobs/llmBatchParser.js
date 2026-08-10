/**
 * LLM Batch Parser — Nightly Job
 *
 * Processes raw emails that weren't matched by any regex parser.
 * Now scoped per-user: accepts a userId UUID and only processes
 * that user's unprocessed emails. Dedupe check is also user-scoped.
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const { queryAsUser } = require('../db/pool');
const { normalize } = require('../services/merchantNormalizer');
const { categorize } = require('../services/categorizer');
const { computeDedupeHash } = require('../services/parserService');

const BATCH_SIZE = 10;

const SYSTEM_PROMPT = `You are a transaction data extractor. Given email content, extract transaction information into structured JSON.

For each email, return one JSON object with these fields:
- amount: number (the transaction amount, e.g. 450.00)
- merchant_raw: string (the merchant/payee name as it appears)
- transaction_type: "debit" or "credit"
- transaction_date: string (ISO date, e.g. "2026-07-15")
- account_last4: string or null (last 4 digits of account/card if mentioned)

If the email is NOT a transaction email (it's marketing, newsletter, etc.), return null.

Return a JSON array with one entry per email, in the same order as provided. No markdown, no explanation — just the JSON array.`;

/**
 * Process a batch of unmatched emails through Claude API for a specific user.
 * @param {string} userId - UUID of the user to process
 * @param {string} userEmail - Email for logging
 */
async function processLlmBatch(userId, userEmail = '') {
  if (!config.anthropic.apiKey) {
    console.log('[LLM Batch] No Anthropic API key configured, skipping');
    return { processed: 0, skipped: 0, errors: 0 };
  }

  if (!userId) {
    console.warn('[LLM Batch] processLlmBatch called without userId');
    return { processed: 0, skipped: 0, errors: 0 };
  }

  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  // Fetch this user's unprocessed emails only
  const { rows: unprocessed } = await queryAsUser(userId,
    `SELECT id, gmail_message_id, sender, subject, body, user_id
     FROM raw_emails
     WHERE processed = false
       AND user_id = $1
     ORDER BY received_at ASC
     LIMIT 100`,
    [userId]
  );

  if (unprocessed.length === 0) {
    console.log(`[LLM Batch] No unprocessed emails for ${userEmail || userId}`);
    return { processed: 0, skipped: 0, errors: 0 };
  }

  console.log(`[LLM Batch] Processing ${unprocessed.length} unmatched emails for ${userEmail || userId}`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < unprocessed.length; i += BATCH_SIZE) {
    const batch = unprocessed.slice(i, i + BATCH_SIZE);

    const emailsText = batch
      .map(
        (e, idx) =>
          `--- EMAIL ${idx + 1} ---\nFrom: ${e.sender}\nSubject: ${e.subject}\nBody: ${e.body?.substring(0, 2000) || '(empty)'}`
      )
      .join('\n\n');

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract transaction data from these ${batch.length} emails:\n\n${emailsText}`,
          },
        ],
      });

      const responseText = response.content[0]?.text || '[]';
      let results;

      try {
        results = JSON.parse(responseText);
      } catch (parseErr) {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          results = JSON.parse(jsonMatch[0]);
        } else {
          console.error('[LLM Batch] Failed to parse LLM response:', responseText.substring(0, 200));
          errors += batch.length;
          continue;
        }
      }

      for (let j = 0; j < batch.length; j++) {
        const email = batch[j];
        const result = results[j];

        if (!result || result === null) {
          // Not a transaction email — mark as processed
          await queryAsUser(userId,
            'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1 AND user_id = $2',
            [email.gmail_message_id, userId]
          );
          skipped++;
          continue;
        }

        try {
          const merchantNormalized = normalize(result.merchant_raw || 'Unknown');
          const category = await categorize(merchantNormalized);
          const txnDate = result.transaction_date
            ? new Date(result.transaction_date)
            : new Date();
          const dedupeHash = computeDedupeHash(
            result.amount,
            merchantNormalized,
            txnDate
          );

          // Cross-email duplicate check — scoped to this user
          const dupeCheck = await queryAsUser(userId,
            'SELECT id FROM transactions WHERE dedupe_hash = $1 AND user_id = $2',
            [dedupeHash, userId]
          );

          if (dupeCheck.rows.length > 0) {
            await queryAsUser(userId,
              'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1 AND user_id = $2',
              [email.gmail_message_id, userId]
            );
            skipped++;
            continue;
          }

          await queryAsUser(userId,
            `INSERT INTO transactions
               (user_id, gmail_message_id, amount, merchant_raw, merchant_normalized,
                category, transaction_type, transaction_date, parse_confidence, dedupe_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (user_id, gmail_message_id) DO NOTHING`,
            [
              userId,
              email.gmail_message_id,
              result.amount,
              result.merchant_raw,
              merchantNormalized,
              category,
              result.transaction_type || 'debit',
              txnDate,
              0.7, // LLM fallback confidence
              dedupeHash,
            ]
          );

          await queryAsUser(userId,
            'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1 AND user_id = $2',
            [email.gmail_message_id, userId]
          );

          processed++;
          console.log(
            `[LLM Batch] Parsed ${email.gmail_message_id}: ₹${result.amount} at ${merchantNormalized}`
          );
        } catch (insertErr) {
          console.error(
            `[LLM Batch] Error inserting ${email.gmail_message_id}:`,
            insertErr.message
          );
          errors++;
        }
      }
    } catch (apiErr) {
      console.error('[LLM Batch] Claude API error:', apiErr.message);
      errors += batch.length;
    }
  }

  console.log(`[LLM Batch] Complete for ${userEmail || userId}. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
  return { processed, skipped, errors };
}

module.exports = { processLlmBatch };
