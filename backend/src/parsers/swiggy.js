/**
 * Swiggy Email Parser
 *
 * Handles Swiggy order confirmations and payment receipts.
 */

const patterns = [
  // Order confirmation with total
  // "Your order of ₹XXX from RESTAURANT has been placed"
  {
    regex: /order.*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:from|at)\s+(.+?)(?:\s+has\s+been|\s+was|\s+is)?(?:\s+(?:placed|confirmed|delivered))?/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },

  // Payment receipt
  // "₹XXX paid for your Swiggy order from RESTAURANT"
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:paid|charged).*?(?:swiggy|order).*?(?:from|at)\s+(.+?)(?:\.|$)/is,
    type: 'debit',
    groups: { amount: 1, merchant: 2 },
  },

  // Total amount format
  // "Total: ₹XXX" or "Grand Total: ₹XXX"
  {
    regex: /(?:total|grand\s+total|amount)\s*:?\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/is,
    type: 'debit',
    groups: { amount: 1 },
  },
];

function parseAmount(str) { return parseFloat(str.replace(/,/g, '')); }

function cleanMerchant(str) {
  if (!str) return 'Swiggy';
  return 'Swiggy - ' + str.replace(/[.\s]+$/, '').trim();
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
        merchant_raw: groups.merchant ? cleanMerchant(match[groups.merchant]) : 'Swiggy',
        transaction_type: type,
        transaction_date: new Date(), // Swiggy emails are usually real-time
        account_last4: null,
      };
    }
  }
  return null;
}

module.exports = { extract };
