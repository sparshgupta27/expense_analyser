/**
 * ICICI Bank Email Parser
 *
 * Handles ICICI alert formats:
 * 1. Credit card transaction alerts
 * 2. Savings account debit/credit
 * 3. UPI alerts
 */

const patterns = [
  // Pattern 1: Credit card transaction
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:spent|charged|transaction).*?(?:card|cc).*?(\d{4}).*?(?:at|to|towards)\s+(.+?)(?:\s+on\s+([\d\-\/]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 2: Account debit
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:debited|debit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/]+)?.*?(?:to|for|at)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { account: 1, amount: 2, date: 3, merchant: 4 },
  },

  // Pattern 3: Account credit
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:credited|credit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/]+)?/is,
    type: 'credit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },

  // Pattern 4: Amount first format
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been\s+)?(?:debited|debit).*?(?:a\/c|account).*?(\d{4}).*?(?:to|for)\s+(.+?)(?:\s+on\s+([\d\-\/]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
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
  if (!str) return 'ICICI Transaction';
  return str.replace(/ref\s*(?:no|number)?\.?\s*\d+/i, '').replace(/[.\s]+$/, '').trim() || 'ICICI Transaction';
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
        merchant_raw: groups.merchant ? cleanMerchant(match[groups.merchant]) : 'ICICI Transfer',
        transaction_type: type,
        transaction_date: parseDate(groups.date ? match[groups.date] : null),
        account_last4: groups.account ? match[groups.account] : null,
      };
    }
  }
  return null;
}

module.exports = { extract };
