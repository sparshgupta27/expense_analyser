/**
 * Amazon Email Parser
 *
 * Handles Amazon order confirmations and payment notifications.
 * Amazon emails are HTML-heavy, so we match against common text patterns.
 */

const patterns = [
  // Order confirmed with total
  // "Your order #XXX of ₹X,XXX has been confirmed"
  {
    regex: /order.*?#?\s*[\d\-]+.*?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/is,
    type: 'debit',
    groups: { amount: 1 },
  },

  // Grand total in order summary
  {
    regex: /(?:order\s+total|grand\s+total|total\s+amount)\s*:?\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/is,
    type: 'debit',
    groups: { amount: 1 },
  },

  // Payment of ₹XXX for your Amazon order
  {
    regex: /(?:payment|charged)\s+(?:of\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:amazon|order)/is,
    type: 'debit',
    groups: { amount: 1 },
  },

  // Refund notification
  {
    regex: /refund\s+of\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?).*?(?:processed|initiated|credited)/is,
    type: 'credit',
    groups: { amount: 1 },
  },

  // Simple amount from subject line
  {
    regex: /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/is,
    type: 'debit',
    groups: { amount: 1 },
  },
];

function parseAmount(str) { return parseFloat(str.replace(/,/g, '')); }

function extract(subject, body) {
  const text = `${subject} ${body}`;

  // Check if this is an order/payment email (not marketing)
  if (!/order|payment|invoice|receipt|charged|refund/i.test(text)) {
    return null; // Skip marketing/promotional Amazon emails
  }

  for (const { regex, type, groups } of patterns) {
    const match = text.match(regex);
    if (match) {
      const amount = parseAmount(match[groups.amount]);
      if (isNaN(amount) || amount <= 0) continue;
      // Skip very small amounts (probably not an order total)
      if (amount < 10 && type === 'debit') continue;

      return {
        amount,
        merchant_raw: type === 'credit' ? 'Amazon Refund' : 'Amazon',
        transaction_type: type,
        transaction_date: new Date(),
        account_last4: null,
      };
    }
  }
  return null;
}

module.exports = { extract };
