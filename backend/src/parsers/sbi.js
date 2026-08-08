/**
 * SBI (State Bank of India) Email Parser
 * Handles SBI alerts: Savings debit/credit, ATM withdrawals, UPI alerts
 */

const { parseIndianDate } = require('../utils/dateParser');
const { normalize } = require('../services/merchantNormalizer');

const patterns = [
  // Pattern 1: SBI debit alert ("Your A/c XX1234 is debited by Rs.XXX on DD-MM-YY towards MERCHANT")
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:debited|debit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})?.*?(?:towards|to|for|at|by)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { account: 1, amount: 2, date: 3, merchant: 4 },
  },

  // Pattern 2: SBI credit alert
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:credited|credit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})?/is,
    type: 'credit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },

  // Pattern 3: Amount debited format
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been\s+)?(?:debited|debit).*?(?:a\/c|account).*?(\d{4}).*?(?:to|at|for)\s+(.+?)(?:\s+on\s+([\d\-\/\sA-Za-z]{6,12}))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 4: ATM withdrawal
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:withdrawn|withdrawal|ATM).*?(?:a\/c|account).*?(\d{4}).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})?/is,
    type: 'debit',
    groups: { amount: 1, account: 2, date: 3, merchant: null },
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
      let merchantName = normalize(rawMerchant);
      if (/atm|withdrawal/i.test(text)) {
        merchantName = 'ATM Withdrawal';
      }

      const dateStr = groups.date ? match[groups.date] : null;

      return {
        amount,
        merchant_raw: merchantName === 'Bank Merchant' ? 'SBI Card/Bank' : merchantName,
        merchant_normalized: merchantName === 'Bank Merchant' ? 'SBI Card' : merchantName,
        transaction_type: type,
        transaction_date: parseIndianDate(dateStr),
        account_last4: groups.account ? match[groups.account] : null,
      };
    }
  }

  return null;
}

module.exports = { extract };
