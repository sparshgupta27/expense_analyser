const { google } = require('googleapis');
const config = require('../config');
const { query } = require('../db/pool');
const { getAuthenticatedClient } = require('../auth/google');
const { parse } = require('../parsers');
const mockStore = require('../db/mockStore');

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

  // Full context matching across both sender and subject text
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
 * Strict fallback parser for real transaction emails only.
 */
function strictTransactionParser(subject, body, sender, emailDate) {
  const fullText = `${subject}\n${body}`;

  if (/unsubscribe|newsletter|discount|offer|coupon|deal of the day/i.test(subject) && !/debited|credited|paid|invoice|receipt/i.test(subject)) {
    return null;
  }

  const isPaymentEmail = /debited|credited|paid|spent|transferred|order total|payment of|vpa|upi|a\/c|card|invoice|receipt|successful/i.test(fullText);
  if (!isPaymentEmail) return null;

  const amountMatch = fullText.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                      fullText.match(/debited\s*(?:by|for)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                      fullText.match(/paid\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                      fullText.match(/order\s*total\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);

  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0 || amount > 1000000) return null;

  const merchant = cleanMerchantName(sender, subject);
  const isCredit = /credited|refund|cashback/i.test(fullText) && !/debited/i.test(fullText);

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
 * Main sync function — queries Gmail messages and parses into active transaction store.
 * Uses parallel batching for speed.
 */
async function syncEmails() {
  console.log('[Ingestion] Starting strict transaction email sync from Gmail...');

  const auth = await getAuthenticatedClient();
  if (!auth) {
    console.warn('[Ingestion] Not authenticated with Google OAuth. User must authorize first.');
    return { fetched: 0, parsed: 0, status: 'unauthenticated' };
  }

  const gmail = google.gmail({ version: 'v1', auth });

  try {
    let searchQuery = 'debited OR credited OR paid OR spent OR transferred OR UPI OR VPA OR HDFC OR SBI OR ICICI OR Axis OR Kotak OR Swiggy OR Zomato OR Amazon OR Flipkart OR Blinkit OR Zepto OR PhonePe OR Paytm OR GPay OR "Google Pay" OR "Bank Alert" OR "Order Confirmation" OR "Payment Received" OR "Payment Sent" OR invoice OR receipt OR statement';
    
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

    console.log(`[Ingestion] Total ${allMessages.length} emails found for processing.`);

    mockStore.clearRealTransactions();
    let parsedCount = 0;

    // Process messages in parallel batches of 10 for speed
    const BATCH_SIZE = 10;
    for (let i = 0; i < allMessages.length; i += BATCH_SIZE) {
      const batch = allMessages.slice(i, i + BATCH_SIZE);
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

          // Run registered parser or strict fallback parser
          let parsedResult = parse(sender, subject, body);
          if (!parsedResult) {
            parsedResult = strictTransactionParser(subject, body, sender, receivedAt);
          }

          if (parsedResult) {
            const txDate = (parsedResult.transaction_date && parsedResult.transaction_date.toDateString() !== new Date().toDateString())
              ? parsedResult.transaction_date
              : receivedAt;

            return {
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
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          mockStore.addRealParsedTransaction(result.value);
          parsedCount++;
        } else if (result.status === 'rejected') {
          console.error(`[Ingestion] Error processing message:`, result.reason?.message || result.reason);
        }
      }
    }

    console.log(`[Ingestion] Sync complete! Parsed ${parsedCount} clean transactions from Gmail.`);
    return { fetched: allMessages.length, parsed: parsedCount, status: 'success' };

  } catch (err) {
    console.error('[Ingestion] Error during Gmail API call:', err.message);
    return { fetched: 0, parsed: 0, status: 'error', error: err.message };
  }
}

module.exports = { syncEmails, cleanMerchantName, strictTransactionParser };
