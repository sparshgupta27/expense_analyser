/**
 * ICICI Bank Email Parser
 * Handles ICICI alerts: Credit cards, Savings debit/credit, UPI
 */

const { parseIndianDate } = require('../utils/dateParser');
const { normalize } = require('../services/merchantNormalizer');

const patterns = [
  // Pattern 1: Credit card transaction ("Rs.XXX spent on ICICI Card 1234 at MERCHANT on DD-MM-YY")
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:spent|charged|transaction).*?(?:card|cc).*?(\d{4}).*?(?:at|to|towards)\s+(.+?)(?:\s+on\s+([\d\-\/\sA-Za-z]{6,12}))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 2: Account debit
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:debited|debit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})?.*?(?:to|for|at)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { account: 1, amount: 2, date: 3, merchant: 4 },
  },

  // Pattern 3: Account credit
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:credited|credit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})?/is,
    type: 'credit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },

  // Pattern 4: Amount first format
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been\s+)?(?:debited|debit).*?(?:a\/c|account).*?(\d{4}).*?(?:to|for)\s+(.+?)(?:\s+on\s+([\d\-\/\sA-Za-z]{6,12}))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },
];

function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, ''));
}

function extract(subject, body) {
  const text = `${subject} ${body}`;

  for (const { regex, type, groups } of patterns) {
    const match = text.match(regex);
    if (match) {
      const amount = parseAmount(match[groups.amount]);
      if (isNaN(amount) || amount <= 0) continue;

      const rawMerchant = groups.merchant ? match[groups.merchant] : text;
      const merchantName = normalize(rawMerchant);
      const dateStr = groups.date ? match[groups.date] : null;

      return {
        amount,
        merchant_raw: merchantName === 'Bank Merchant' ? 'ICICI Bank Alert' : merchantName,
        merchant_normalized: merchantName === 'Bank Merchant' ? 'ICICI Bank' : merchantName,
        transaction_type: type,
        transaction_date: parseIndianDate(dateStr),
        account_last4: groups.account ? match[groups.account] : null,
      };
    }
  }

  return null;
}

module.exports = { extract };
