/**
 * SBI (State Bank of India) Email Parser
 *
 * Handles SBI alert formats:
 * 1. Debit alerts: "Your A/c XX1234 is debited for Rs.XXX"
 * 2. Credit alerts: "Your A/c XX1234 is credited with Rs.XXX"
 * 3. ATM withdrawal alerts
 * 4. UPI transaction alerts
 */

const patterns = [
  // Pattern 1: SBI debit alert
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:debited|debit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/]+)?.*?(?:to|towards|for|at|by)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { account: 1, amount: 2, date: 3, merchant: 4 },
  },

  // Pattern 2: SBI credit alert
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:credited|credit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/]+)?/is,
    type: 'credit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },

  // Pattern 3: Amount debited format
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been\s+)?(?:debited|debit).*?(?:a\/c|account).*?(\d{4}).*?(?:to|at|for)\s+(.+?)(?:\s+on\s+([\d\-\/]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 4: ATM withdrawal
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:withdrawn|withdrawal|ATM).*?(?:a\/c|account).*?(\d{4}).*?(?:on|dated?)\s*([\d\-\/]+)?/is,
    type: 'debit',
    groups: { amount: 1, account: 2, date: 3, merchant: null },
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
  if (!str) return 'SBI Transaction';
  return str.replace(/ref\s*(?:no|number)?\.?\s*\d+/i, '').replace(/[.\s]+$/, '').trim() || 'SBI Transaction';
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
        merchant_raw: groups.merchant ? cleanMerchant(match[groups.merchant]) : (type === 'debit' && /atm|withdrawal/i.test(text) ? 'ATM Withdrawal' : 'SBI Transfer'),
        transaction_type: type,
        transaction_date: parseDate(groups.date ? match[groups.date] : null),
        account_last4: groups.account ? match[groups.account] : null,
      };
    }
  }
  return null;
}

module.exports = { extract };
