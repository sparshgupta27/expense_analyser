/**
 * HDFC Bank Email Parser
 *
 * Handles multiple HDFC alert formats:
 * 1. Savings account debit/credit alerts
 * 2. Credit card transaction alerts
 * 3. UPI transaction alerts
 * 4. NEFT/IMPS transfer alerts
 */

// Amount regex: handles Rs., Rs, INR, ₹ with optional commas
const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;

// Account last 4 digits
const ACCOUNT_RE = /(?:a\/c|account|acct|card).*?(?:no\.?|ending|xx)?\s*(\d{4})/i;

const patterns = [
  // Pattern 1: Savings account debit alert
  // "Rs.XXX has been debited from your A/c **1234 on DD-MM-YY to..."
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been|is)\s+debited\s+from\s+.*?(?:a\/c|account).*?(\d{4}).*?(?:on|dated?)\s*([\d\-\/]+).*?(?:to|towards|for|at)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, date: 3, merchant: 4 },
  },

  // Pattern 2: Savings account credit alert
  // "Rs.XXX has been credited to your A/c **1234 on DD-MM-YY"
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been|is)\s+credited\s+to\s+.*?(?:a\/c|account).*?(\d{4}).*?(?:on|dated?)\s*([\d\-\/]+)/is,
    type: 'credit',
    groups: { amount: 1, account: 2, date: 3, merchant: null },
  },

  // Pattern 3: Credit card transaction
  // "Transaction of Rs.XXX on your HDFC Card ending 5678 at MERCHANT on DD-MM-YY"
  {
    regex: /(?:transaction|txn).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:card|cc).*?(\d{4}).*?(?:at|to|towards)\s+(.+?)(?:\s+on\s+([\d\-\/]+)|\.|\s+has\s+been)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 4: UPI transaction
  // "Rs.XXX debited from A/c XX1234 via UPI to MERCHANT on DD-MM-YY"
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:debited|debit).*?(?:a\/c|account).*?(\d{4}).*?(?:UPI|IMPS|NEFT).*?(?:to|for)\s+(.+?)(?:\s+on\s+([\d\-\/]+))?(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, account: 2, merchant: 3, date: 4 },
  },

  // Pattern 5: Generic debit (fallback for HDFC)
  // "Your A/c XX1234 is debited with Rs.XXX"
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:debited|debit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/]+)?/is,
    type: 'debit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },

  // Pattern 6: Generic credit (fallback for HDFC)
  {
    regex: /(?:a\/c|account).*?(\d{4}).*?(?:credited|credit).*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:on|dated?)\s*([\d\-\/]+)?/is,
    type: 'credit',
    groups: { account: 1, amount: 2, date: 3, merchant: null },
  },
];

/**
 * Parse an Indian date string (DD-MM-YY, DD-MM-YYYY, DD/MM/YYYY, etc.)
 */
function parseDate(dateStr) {
  if (!dateStr) return new Date();

  // Clean up the string
  dateStr = dateStr.trim();

  // Try DD-MM-YYYY or DD/MM/YYYY
  const match = dateStr.match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})/);
  if (match) {
    let [, day, month, year] = match;
    if (year.length === 2) {
      year = '20' + year;
    }
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try standard Date parse as fallback
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Parse amount string: remove commas, convert to float.
 */
function parseAmount(amountStr) {
  return parseFloat(amountStr.replace(/,/g, ''));
}

/**
 * Clean merchant name: trim, remove trailing reference IDs.
 */
function cleanMerchant(merchantStr) {
  if (!merchantStr) return 'Unknown';
  return merchantStr
    .replace(/\s*ref\s*(?:no|number)?\.?\s*\d+/i, '')
    .replace(/\s*txn\s*(?:no|id)?\.?\s*\d+/i, '')
    .replace(/[.\s]+$/, '')
    .trim() || 'Unknown';
}

/**
 * Extract transaction data from an HDFC Bank email.
 */
function extract(subject, body) {
  const text = `${subject} ${body}`;

  for (const { regex, type, groups } of patterns) {
    const match = text.match(regex);
    if (match) {
      const amountStr = match[groups.amount];
      const amount = parseAmount(amountStr);

      if (isNaN(amount) || amount <= 0) continue;

      const result = {
        amount,
        merchant_raw: groups.merchant ? cleanMerchant(match[groups.merchant]) : 'HDFC Transfer',
        transaction_type: type,
        transaction_date: parseDate(groups.date ? match[groups.date] : null),
        account_last4: groups.account ? match[groups.account] : null,
      };

      return result;
    }
  }

  // Try a simple amount extraction from subject as last resort
  const subjectMatch = subject.match(AMOUNT_RE);
  if (subjectMatch) {
    const amount = parseAmount(subjectMatch[1]);
    if (amount > 0) {
      const isCredit = /credit/i.test(subject);
      const accountMatch = text.match(ACCOUNT_RE);

      return {
        amount,
        merchant_raw: 'HDFC Transaction',
        transaction_type: isCredit ? 'credit' : 'debit',
        transaction_date: new Date(),
        account_last4: accountMatch ? accountMatch[1] : null,
      };
    }
  }

  return null;
}

module.exports = { extract };
