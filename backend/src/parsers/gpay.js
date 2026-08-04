/**
 * Google Pay (GPay) Email Parser
 *
 * Handles GPay notification formats:
 * 1. Payment sent ("You paid ₹XXX to MERCHANT")
 * 2. Payment received ("PERSON paid you ₹XXX")
 * 3. UPI transaction confirmations
 */

const patterns = [
  // Pattern 1: Payment sent
  // "You paid ₹XXX to MERCHANT" or "You sent ₹XXX to MERCHANT"
  {
    regex: /you\s+(?:paid|sent)\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Pattern 2: Payment received
  // "PERSON paid you ₹XXX" or "You received ₹XXX from PERSON"
  {
    regex: /(.+?)\s+paid\s+you\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)(?:\s+on\s+([\d\-\/\s\w,]+))?/is,
    type: 'credit',
    groups: { merchant: 1, amount: 2, date: 3 },
  },
  {
    regex: /you\s+received\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\.|$)/is,
    type: 'credit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Pattern 3: Transaction successful
  // "₹XXX successfully paid to MERCHANT"
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:successfully\s+)?paid\s+to\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Pattern 4: UPI debit confirmation
  // "Debited ₹XXX from your account for payment to MERCHANT via UPI"
  {
    regex: /(?:debited|debit)\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:payment\s+to|transfer\s+to)\s+(.+?)(?:\s+via|\s+on\s+([\d\-\/\s\w,]+))?/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Pattern 5: Generic GPay format (subject-line based)
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:to|from)\s+(.+)/is,
    type: 'debit', // Default to debit; will check for credit keywords
    groups: { amount: 1, merchant: 2 },
  },
];

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  dateStr = dateStr.trim();

  const match = dateStr.match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})/);
  if (match) {
    let [, day, month, year] = match;
    if (year.length === 2) year = '20' + year;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseAmount(amountStr) {
  return parseFloat(amountStr.replace(/,/g, ''));
}

function cleanMerchant(str) {
  if (!str) return 'Unknown';
  return str
    .replace(/via\s+UPI/i, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/[.\s]+$/, '')
    .trim() || 'Unknown';
}

function extract(subject, body) {
  const text = `${subject} ${body}`;

  for (const { regex, type, groups } of patterns) {
    const match = text.match(regex);
    if (match) {
      const amount = parseAmount(match[groups.amount]);
      if (isNaN(amount) || amount <= 0) continue;

      // Check if this is actually a credit (received/credited keywords in context)
      let txnType = type;
      if (type === 'debit' && /\bfrom\b/i.test(match[0]) && /\breceived?\b/i.test(text)) {
        txnType = 'credit';
      }

      return {
        amount,
        merchant_raw: cleanMerchant(match[groups.merchant]),
        transaction_type: txnType,
        transaction_date: parseDate(groups.date ? match[groups.date] : null),
        account_last4: null, // GPay doesn't typically include account numbers
      };
    }
  }

  return null;
}

module.exports = { extract };
