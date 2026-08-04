/**
 * Paytm Email Parser
 *
 * Handles Paytm notification formats:
 * 1. Payment successful
 * 2. Money received
 * 3. Recharge/bill payments
 * 4. Wallet transactions
 */

const patterns = [
  // Payment successful
  {
    regex: /(?:paid|payment)\s+(?:of\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:to|for)\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\s+was|\s+is)?(?:\s+successful)?/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Money received
  {
    regex: /(?:received|credited)\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\.|$)/is,
    type: 'credit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Recharge
  {
    regex: /(?:recharge|bill)\s+(?:of\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:for|to)\s+(.+?)(?:\s+(?:was|is)\s+successful)?/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },

  // Generic amount extraction
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:debited|paid|sent)\s+(?:to|for)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },
];

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  const match = dateStr.trim().match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})/);
  if (match) {
    let [, day, month, year] = match;
    if (year.length === 2) year = '20' + year;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseAmount(str) { return parseFloat(str.replace(/,/g, '')); }

function cleanMerchant(str) {
  if (!str) return 'Unknown';
  return str.replace(/via\s+(?:UPI|Paytm)/i, '').replace(/\s*\(.*?\)\s*/g, '').replace(/[.\s]+$/, '').trim() || 'Unknown';
}

function extract(subject, body) {
  const text = `${subject} ${body}`;
  for (const { regex, type, groups } of patterns) {
    const match = text.match(regex);
    if (match) {
      const amount = parseAmount(match[groups.amount]);
      if (isNaN(amount) || amount <= 0) continue;
      return {
        amount,
        merchant_raw: cleanMerchant(match[groups.merchant]),
        transaction_type: type,
        transaction_date: parseDate(groups.date ? match[groups.date] : null),
        account_last4: null,
      };
    }
  }
  return null;
}

module.exports = { extract };
