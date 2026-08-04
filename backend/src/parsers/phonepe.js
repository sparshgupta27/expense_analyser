/**
 * PhonePe Email Parser
 *
 * Handles PhonePe notification formats:
 * 1. Payment successful ("You have paid ₹XXX to MERCHANT")
 * 2. Money received ("You have received ₹XXX from PERSON")
 * 3. Transaction confirmation with UPI reference
 */

const patterns = [
  // Pattern 1: Payment successful
  // "You have paid ₹XXX to MERCHANT"
  {
    regex: /you\s+(?:have\s+)?paid\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Pattern 2: Money received
  // "You have received ₹XXX from PERSON"
  {
    regex: /you\s+(?:have\s+)?received\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\.|$)/is,
    type: 'credit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Pattern 3: Payment of ₹XXX to MERCHANT was successful
  {
    regex: /payment\s+of\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)\s+(?:was|is)\s+successful/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },

  // Pattern 4: Debited ₹XXX for MERCHANT
  {
    regex: /(?:debited|debit)\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:for|to)\s+(.+?)(?:\s+on\s+([\d\-\/\s\w,]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2, date: 3 },
  },

  // Pattern 5: Recharge/bill payment
  // "Your recharge of ₹XXX for NUMBER was successful"
  {
    regex: /(?:recharge|bill\s+payment)\s+of\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:for|to)\s+(.+?)(?:\s+was)?(?:\s+successful)?/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },

  // Pattern 6: Generic PhonePe amount extraction
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:paid|sent|transferred)\s+(?:to|for)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
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
    .replace(/via\s+(?:UPI|PhonePe)/i, '')
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
