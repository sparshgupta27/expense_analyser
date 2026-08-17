const { google } = require('googleapis');
const config = require('../config');
const { queryAsUser } = require('../db/pool');
const { getAuthenticatedClient } = require('../auth/google');
const { parse } = require('../parsers');

function getErrorDetails(err) {
  return err?.response?.data?.error_description ||
    err?.response?.data?.error ||
    err?.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
    err?.message ||
    'Unknown error';
}

/**
 * Decode base64url-encoded email body content.
 */
function decodeBase64Url(data) {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf-8');
}

/**
 * Extract plain text body from Gmail message payload.
 */
function extractBody(payload) {
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
  }

  return '';
}

/**
 * Extract header value from Gmail message headers.
 */
function getHeader(headers, name) {
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  );
  return header ? header.value : null;
}

/**
 * Clean & normalize merchant name from sender/subject.
 */
function cleanMerchantName(sender, subject) {
  const text = `${sender || ''} ${subject || ''}`.toLowerCase();

  if (text.includes('swiggy')) return 'Swiggy';
  if (text.includes('zomato')) return 'Zomato';
  if (text.includes('blinkit')) return 'Blinkit';
  if (text.includes('zepto')) return 'Zepto';
  if (text.includes('amazon')) return 'Amazon';
  if (text.includes('flipkart')) return 'Flipkart';
  if (text.includes('myntra')) return 'Myntra';
  if (text.includes('ajio')) return 'Ajio';
  if (text.includes('nykaa')) return 'Nykaa';
  if (text.includes('uber')) return 'Uber';
  if (text.includes('ola')) return 'Ola';
  if (text.includes('rapido')) return 'Rapido';
  if (text.includes('netflix')) return 'Netflix';
  if (text.includes('spotify')) return 'Spotify';
  if (text.includes('airtel')) return 'Airtel';
  if (text.includes('jio')) return 'Jio';
  if (text.includes('bescom')) return 'Bescom';
  if (text.includes('hdfc')) return 'HDFC Bank';
  if (text.includes('icici')) return 'ICICI Bank';
  if (text.includes('sbi')) return 'SBI Card';
  if (text.includes('axis')) return 'Axis Bank';
  if (text.includes('kotak')) return 'Kotak Bank';
  if (text.includes('phonepe')) return 'PhonePe';
  if (text.includes('paytm')) return 'Paytm';
  if (text.includes('gpay') || text.includes('google pay')) return 'Google Pay';
  if (/\bcred\b|cred\.club/i.test(text)) return 'CRED';

  const sName = sender.split('<')[0].replace(/"/g, '').trim();
  if (sName && !sName.includes('@')) return sName;
  return 'Bank Merchant';
}

/**
 * Verified sender domain list & mandatory bank reference rules for 100% precision.
 */
const KNOWN_FINANCIAL_SENDERS = [
  'hdfcbank', 'icicibank', 'sbicard', 'sbi.co.in', 'axisbank', 'kotak', 'idfcfirstbank',
  'phonepe', 'paytm', 'googlepay', 'gpay', 'cred.club', 'razorpay', 'cashfree', 'billdesk',
  'swiggy', 'zomato', 'uber', 'amazon', 'flipkart', 'blinkit', 'zepto', 'netflix', 'spotify', 'apple',
];

/**
 * Strict fallback parser for real transaction emails only.
 */
function strictTransactionParser(subject, body, sender, emailDate) {
  const fullText = `${subject}\n${body}`;
  const senderLower = (sender || '').toLowerCase();

  if (/prizes? worth|prize pool|opportunities for you|competitions|register now|win up to|rewards worth|cashback up to|newsletter|unsubscribe|discount|offer|coupon|deal of the day|job alert|hiring|webinar|course/i.test(fullText)) {
    return null;
  }

  const hasPaymentVerb = /\b(?:debited|credited|paid|spent|transferred|order total|payment of|invoice|receipt)\b/i.test(fullText);
  if (!hasPaymentVerb) return null;

  const isKnownSender = KNOWN_FINANCIAL_SENDERS.some((domain) => senderLower.includes(domain));
  const hasBankRef = /\b(?:a\/c|acc|account|card|upi|vpa|imps|neft|rtgs|ref\s*no|txn\s*id|order\s*id|invoice|receipt)\b/i.test(fullText);

  if (!isKnownSender && !hasBankRef) {
    return null;
  }

  const amountMatch = fullText.match(/(?:debited|credited|paid|spent|transferred|total|amount)\s*(?:by|for|of)?\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                      fullText.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:debited|credited|paid|spent|transferred)/i);

  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0 || amount > 1000000) return null;

  const merchant = cleanMerchantName(sender, subject);
  const isCredit = /\b(?:credited to|received in your|refund of|refund processed|cashback credited)\b/i.test(fullText) && !/\bdebited\b/i.test(fullText);

  return {
    amount,
    merchant_raw: merchant,
    merchant_normalized: merchant,
    transaction_type: isCredit ? 'credit' : 'debit',
    transaction_date: emailDate,
    confidence: 0.9,
  };
}

/**
 * Save a parsed transaction for a user identified by UUID.
 * Uses per-user unique constraint (user_id, gmail_message_id).
 */
async function saveParsedTransaction({ userId, userEmail, msg, sender, subject, body, receivedAt, transaction }) {
  await queryAsUser(userId,
    `INSERT INTO raw_emails (user_id, user_email, gmail_message_id, sender, subject, body, received_at, processed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     ON CONFLICT (user_id, gmail_message_id)
     DO UPDATE SET
       sender     = EXCLUDED.sender,
       subject    = EXCLUDED.subject,
       body       = EXCLUDED.body,
       received_at = EXCLUDED.received_at,
       processed  = true`,
    [userId, userEmail, msg.id, sender, subject, body, receivedAt]
  );

  await queryAsUser(userId,
    `INSERT INTO transactions (
       user_id, user_email,
       gmail_message_id, amount, merchant_raw, merchant_normalized,
       category, transaction_type, transaction_date, parse_confidence
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, gmail_message_id)
     DO UPDATE SET
       amount              = EXCLUDED.amount,
       merchant_raw        = EXCLUDED.merchant_raw,
       merchant_normalized = EXCLUDED.merchant_normalized,
       category            = EXCLUDED.category,
       transaction_type    = EXCLUDED.transaction_type,
       transaction_date    = EXCLUDED.transaction_date,
       parse_confidence    = EXCLUDED.parse_confidence`,
    [
      userId,
      userEmail,
      msg.id,
      transaction.amount,
      transaction.merchant_raw,
      transaction.merchant_normalized,
      transaction.category || 'Other',
      transaction.transaction_type,
      transaction.transaction_date,
      transaction.confidence || 0.9,
    ]
  );
}

/**
 * Main sync function — queries Gmail messages for a specific user and saves into Postgres.
 * @param {{ userId: string, userEmail: string }} user
 */
async function syncEmails({ userId, userEmail }) {
  if (!userId || !userEmail) {
    console.warn('[Ingestion] syncEmails called without userId/userEmail');
    return { fetched: 0, parsed: 0, status: 'unauthenticated' };
  }

  console.log(`[Ingestion] Starting strict transaction email sync for ${userEmail} (id=${userId})...`);

  // getAuthenticatedClient now takes UUID
  const auth = await getAuthenticatedClient(userId);
  if (!auth) {
    console.warn(`[Ingestion] Not authenticated for ${userEmail}. User must authorize first.`);
    return { fetched: 0, parsed: 0, status: 'unauthenticated' };
  }

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    // Read sync checkpoint for incremental fetch
    let lastSyncAt = null;
    try {
      const syncResult = await queryAsUser(userId,
        'SELECT last_sync_at FROM sync_state WHERE user_id = $1',
        [userId]
      );
      if (syncResult.rows.length > 0 && syncResult.rows[0].last_sync_at) {
        lastSyncAt = new Date(syncResult.rows[0].last_sync_at);
      }
    } catch (e) {
      console.warn('[Ingestion] Could not read sync_state:', e.message);
    }

    const syncStartTime = new Date();

    let searchQuery = 'debited OR credited OR paid OR spent OR transferred OR UPI OR VPA OR HDFC OR SBI OR ICICI OR Axis OR Kotak OR Swiggy OR Zomato OR Amazon OR Flipkart OR Blinkit OR Zepto OR PhonePe OR Paytm OR GPay OR "Google Pay" OR "Bank Alert" OR "Order Confirmation" OR "Payment Received" OR "Payment Sent" OR invoice OR receipt OR statement';

    if (lastSyncAt) {
      // Gmail 'after:' uses epoch seconds
      const afterEpoch = Math.floor(lastSyncAt.getTime() / 1000);
      searchQuery += ` after:${afterEpoch}`;
      console.log(`[Ingestion] Incremental sync for ${userEmail} — fetching emails after ${lastSyncAt.toISOString()}`);
    } else {
      // First sync: scan past 12 months (365 days)
      searchQuery += ' newer_than:365d';
      console.log(`[Ingestion] Initial 12-month sync for ${userEmail} — fetching past 365 days`);
    }

    let pageToken = null;
    const allMessages = [];
    const MAX_PAGES = 10;
    let pageCount = 0;

    do {
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: searchQuery,
        maxResults: 100,
        pageToken: pageToken || undefined,
      });

      const msgs = listResponse.data.messages || [];
      allMessages.push(...msgs);
      pageToken = listResponse.data.nextPageToken;
      pageCount++;
    } while (pageToken && pageCount < MAX_PAGES);

    console.log(`[Ingestion] Total ${allMessages.length} emails found for ${userEmail}.`);

    let parsedCount = 0;
    let savedCount = 0;
    let dbSaveErrors = 0;
    let latestTransactionDate = null;

    const BATCH_SIZE = 8;
    const totalBatches = Math.ceil(allMessages.length / BATCH_SIZE);

    for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const batch = allMessages.slice(i, i + BATCH_SIZE);
      const progressPct = Math.round((i / allMessages.length) * 100);

      console.log(`[GmailSync] ⏳ [${progressPct}%] Batch ${batchIndex}/${totalBatches} (${batch.length} emails)...`);

      const results = await Promise.allSettled(
        batch.map(async (msg) => {
          const msgDetail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          const headers = msgDetail.data.payload?.headers || [];
          const sender = getHeader(headers, 'From') || '';
          const subject = getHeader(headers, 'Subject') || '';
          const dateStr = getHeader(headers, 'Date');
          const receivedAt = dateStr ? new Date(dateStr) : new Date();
          const body = extractBody(msgDetail.data.payload) || msgDetail.data.snippet || '';

          let parsedResult = parse(sender, subject, body);
          if (!parsedResult) {
            parsedResult = strictTransactionParser(subject, body, sender, receivedAt);
          }

          if (parsedResult) {
            const txDate = (parsedResult.transaction_date && parsedResult.transaction_date.toDateString() !== new Date().toDateString())
              ? parsedResult.transaction_date
              : receivedAt;

            const transaction = {
              id: `gmail-${msg.id}`,
              gmail_message_id: msg.id,
              amount: parsedResult.amount,
              merchant_raw: parsedResult.merchant_raw,
              merchant_normalized: parsedResult.merchant_normalized || cleanMerchantName(sender, subject),
              category: parsedResult.category,
              transaction_type: parsedResult.transaction_type || 'debit',
              transaction_date: txDate,
              confidence: parsedResult.confidence || 0.9,
            };

            try {
              await saveParsedTransaction({
                userId,
                userEmail,
                msg,
                sender,
                subject,
                body,
                receivedAt,
                transaction,
              });
              transaction.saved = true;
              console.log(
                `[GmailSync]   ↳ 💳 ${transaction.merchant_normalized} | ₹${transaction.amount} | ` +
                `${transaction.category} | ${txDate.toISOString().substring(0, 10)}`
              );
            } catch (dbErr) {
              transaction.saved = false;
              transaction.saveError = dbErr.message;
              console.warn(`[GmailSync]   ↳ ⚠️ Failed to save ${transaction.merchant_normalized}:`, dbErr.message);
            }

            return transaction;
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          parsedCount++;
          if (result.value.saved) {
            savedCount++;
          } else {
            dbSaveErrors++;
          }
          const txDate = new Date(result.value.transaction_date);
          if (!latestTransactionDate || txDate > latestTransactionDate) {
            latestTransactionDate = txDate;
          }
        } else if (result.status === 'rejected') {
          console.error(`[GmailSync] ⚠️ Error processing message:`, result.reason?.message || result.reason);
        }
      }
    }

    const latestMonth = latestTransactionDate
      ? `${latestTransactionDate.getFullYear()}-${String(latestTransactionDate.getMonth() + 1).padStart(2, '0')}`
      : null;

    // Update sync checkpoint
    try {
      await queryAsUser(userId,
        `INSERT INTO sync_state (user_id, last_sync_at, emails_fetched)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET
           last_sync_at = $2,
           emails_fetched = sync_state.emails_fetched + $3`,
        [userId, syncStartTime, allMessages.length]
      );
    } catch (e) {
      console.warn('[GmailSync] Could not update sync_state:', e.message);
    }

    const durationSec = ((Date.now() - syncStartTime.getTime()) / 1000).toFixed(1);
    console.log(
      `[GmailSync] ✨ Sync complete for ${userEmail} in ${durationSec}s! ` +
      `Scanned ${allMessages.length} emails → parsed ${parsedCount} txns → saved ${savedCount} to PostgreSQL.`
    );
    return {
      fetched: allMessages.length,
      parsed: parsedCount,
      saved: savedCount,
      db_save_errors: dbSaveErrors,
      latest_month: latestMonth,
      status: dbSaveErrors > 0 && savedCount === 0 ? 'partial_error' : 'success',
    };

  } catch (err) {
    const details = getErrorDetails(err);
    console.error(`[Ingestion] Error during Gmail API call for ${userEmail}:`, details);
    return { fetched: 0, parsed: 0, status: 'error', error: 'Gmail sync failed', details };
  }
}

module.exports = { syncEmails, cleanMerchantName, strictTransactionParser };
