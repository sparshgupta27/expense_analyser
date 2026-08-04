/**
 * LLM Batch Parser — Nightly Job
 *
 * Processes raw emails that weren't matched by any regex parser.
 * Batches them and sends to Claude API for structured extraction.
 * Runs as a nightly cron job (2 AM) to keep costs and latency predictable.
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const { query } = require('../db/pool');
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
 * Process a batch of unmatched emails through Claude API.
 */
async function processLlmBatch() {
  if (!config.anthropic.apiKey) {
    console.log('[LLM Batch] No Anthropic API key configured, skipping');
    return { processed: 0, skipped: 0, errors: 0 };
  }

  const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

  // Fetch unprocessed emails
  const { rows: unprocessed } = await query(
    `SELECT id, gmail_message_id, sender, subject, body
     FROM raw_emails
     WHERE processed = false
     ORDER BY received_at ASC
     LIMIT 100`
  );

  if (unprocessed.length === 0) {
    console.log('[LLM Batch] No unprocessed emails to handle');
    return { processed: 0, skipped: 0, errors: 0 };
  }

  console.log(`[LLM Batch] Processing ${unprocessed.length} unmatched emails`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches
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
        // Try to extract JSON from response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          results = JSON.parse(jsonMatch[0]);
        } else {
          console.error('[LLM Batch] Failed to parse LLM response:', responseText.substring(0, 200));
          errors += batch.length;
          continue;
        }
      }

      // Process each result
      for (let j = 0; j < batch.length; j++) {
        const email = batch[j];
        const result = results[j];

        if (!result || result === null) {
          // Not a transaction email — mark as processed
          await query(
            'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1',
            [email.gmail_message_id]
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

          // Check for cross-email duplicate
          const dupeCheck = await query(
            'SELECT id FROM transactions WHERE dedupe_hash = $1',
            [dedupeHash]
          );

          if (dupeCheck.rows.length > 0) {
            await query(
              'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1',
              [email.gmail_message_id]
            );
            skipped++;
            continue;
          }

          await query(
            `INSERT INTO transactions
               (gmail_message_id, amount, merchant_raw, merchant_normalized,
                category, transaction_type, transaction_date, parse_confidence, dedupe_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (gmail_message_id) DO NOTHING`,
            [
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

          await query(
            'UPDATE raw_emails SET processed = true WHERE gmail_message_id = $1',
            [email.gmail_message_id]
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

  console.log(`[LLM Batch] Complete. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
  return { processed, skipped, errors };
}

module.exports = { processLlmBatch };
