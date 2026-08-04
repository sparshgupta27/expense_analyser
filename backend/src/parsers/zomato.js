/**
 * Zomato Email Parser
 *
 * Handles Zomato order confirmations and payment receipts.
 */

const patterns = [
  // Order placed
  {
    regex: /order.*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:from|at)\s+(.+?)(?:\s+has\s+been|\s+was)?(?:\s+(?:placed|confirmed|delivered))?/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },

  // Payment receipt
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:paid|charged).*?(?:zomato|order).*?(?:from|at)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },

  // Total line
  {
    regex: /(?:total|grand\s+total|amount)\s*:?\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/is,
    type: 'debit',
    groups: { amount: 1 },
  },
];

function parseAmount(str) { return parseFloat(str.replace(/,/g, '')); }

function cleanMerchant(str) {
  if (!str) return 'Zomato';
  return 'Zomato - ' + str.replace(/[.\s]+$/, '').trim();
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
        merchant_raw: groups.merchant ? cleanMerchant(match[groups.merchant]) : 'Zomato',
        transaction_type: type,
        transaction_date: new Date(),
        account_last4: null,
      };
    }
  }
  return null;
}

module.exports = { extract };
