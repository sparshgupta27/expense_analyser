/**
 * HDFC Bank Email Parser
 * Handles HDFC alerts: Savings debit/credit, Credit Cards, UPI, NEFT/IMPS
 */

const { parseIndianDate } = require('../utils/dateParser');
const { normalize } = require('../services/merchantNormalizer');

const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const ACCOUNT_RE = /(?:a\/c|account|acct|card).*?(?:no\.?|ending|xx)?\s*(\d{4})/i;

const patterns = [
  // Pattern 1: Savings account debit alert ("Rs.XXX debited from A/c **1234 on DD-MM-YY to MERCHANT")
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been|is)\s+debited\s+from\s+.*?(?:a\/c|account).*?(\d{4}).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12}).*?(?:to|towards|for|at)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, date: 3, merchant: 4 },
  },

  // Pattern 2: Savings account credit alert
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been|is)\s+credited\s+to\s+.*?(?:a\/c|account).*?(\d{4}).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})/is,
    type: 'credit',
    groups: { amount: 1, account: 2, date: 3, merchant: null },
  },

  // Pattern 3: Credit card transaction ("Txn of Rs.XXX on HDFC Card 5678 at MERCHANT on DD-MM-YY")
  {
    regex: /(?:transaction|txn).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:card|cc).*?(\d{4}).*?(?:at|to|towards)\s+(.+?)(?:\s+on\s+([\d\-\/\sA-Za-z]{6,12})|\.|\s+has\s+been)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 4: UPI transaction ("Rs.XXX debited from A/c XX1234 via UPI to MERCHANT on DD-MM-YY")
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:debited|debit).*?(?:a\/c|account).*?(\d{4}).*?(?:UPI|IMPS|NEFT).*?(?:to|for)\s+(.+?)(?:\s+on\s+([\d\-\/\sA-Za-z]{6,12}))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 5: Generic debit fallback
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:debited|debit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})?/is,
    type: 'debit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },

  // Pattern 6: Generic credit fallback
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:credited|credit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/\sA-Za-z]{6,12})?/is,
    type: 'credit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },
];

function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, ''));
}

function cleanMerchant(merchantStr) {
  if (!merchantStr) return 'HDFC Transfer';
  return merchantStr
    .replace(/\s*ref\s*(?:no|number)?\.?\s*\d+/i, '')
    .replace(/\s*txn\s*(?:no|id)?\.?\s*\d+/i, '')
    .replace(/[.\s]+$/, '')
    .trim() || 'HDFC Transfer';
}

function extract(subject, body) {
  const text = `${subject} ${body}`;

  for (const { regex, type, groups } of patterns) {
    const match = text.match(regex);
    if (match) {
      const amountStr = match[groups.amount];
      const amount = parseAmount(amountStr);
      if (isNaN(amount) || amount <= 0) continue;

      const rawMerchant = groups.merchant ? cleanMerchant(match[groups.merchant]) : (type === 'credit' ? 'HDFC Deposit' : 'HDFC Transfer');
      const merchantNormalized = normalize(rawMerchant);
      const dateStr = groups.date ? match[groups.date] : null;

      return {
        amount,
        merchant_raw: rawMerchant,
        merchant_normalized: merchantNormalized === 'Unknown' ? 'HDFC Bank' : merchantNormalized,
        transaction_type: type,
        transaction_date: parseIndianDate(dateStr),
        account_last4: groups.account ? match[groups.account] : null,
      };
    }
  }

  // Fallback regex for subject line amounts
  const subjectMatch = subject.match(AMOUNT_RE);
  if (subjectMatch) {
    const amount = parseAmount(subjectMatch[1]);
    if (amount > 0) {
      const isCredit = /credit/i.test(subject);
      const accountMatch = text.match(ACCOUNT_RE);

      return {
        amount,
        merchant_raw: 'HDFC Transaction',
        merchant_normalized: 'HDFC Bank',
        transaction_type: isCredit ? 'credit' : 'debit',
        transaction_date: parseIndianDate(null),
        account_last4: accountMatch ? accountMatch[1] : null,
      };
    }
  }

  return null;
}

module.exports = { extract };
