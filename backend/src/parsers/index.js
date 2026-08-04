/**
 * Parser Registry
 *
 * Central registry mapping email sender patterns to parser modules.
 * Each parser exports: extract(subject, body) → ParseResult | null
 *
 * ParseResult: {
 *   amount: number,
 *   merchant_raw: string,
 *   transaction_type: 'debit' | 'credit',
 *   transaction_date: Date,
 *   account_last4: string | null
 * }
 */

const hdfcParser = require('./hdfc');
const gpayParser = require('./gpay');
const phonepeParser = require('./phonepe');
const sbiParser = require('./sbi');
const iciciParser = require('./icici');
const paytmParser = require('./paytm');
const swiggyParser = require('./swiggy');
const zomatoParser = require('./zomato');
const amazonParser = require('./amazon');

const parserRegistry = [
  // Banks
  { pattern: /hdfcbank|hdfc\s*bank/i, parser: hdfcParser, name: 'hdfc' },
  { pattern: /sbi|state\s*bank/i, parser: sbiParser, name: 'sbi' },
  { pattern: /icici/i, parser: iciciParser, name: 'icici' },

  // UPI apps
  { pattern: /google.*pay|googleplay|gpay/i, parser: gpayParser, name: 'gpay' },
  { pattern: /phonepe/i, parser: phonepeParser, name: 'phonepe' },
  { pattern: /paytm/i, parser: paytmParser, name: 'paytm' },

  // Merchants
  { pattern: /swiggy/i, parser: swiggyParser, name: 'swiggy' },
  { pattern: /zomato/i, parser: zomatoParser, name: 'zomato' },
  { pattern: /amazon/i, parser: amazonParser, name: 'amazon' },
];

/**
 * Parse an email using the sender-matched parser.
 * Returns { ...fields, confidence: 1.0, parser: name } or null if unmatched.
 */
function parse(sender, subject, body) {
  for (const { pattern, parser, name } of parserRegistry) {
    if (pattern.test(sender) || pattern.test(subject)) {
      try {
        const result = parser.extract(subject, body);
        if (result) {
          return {
            ...result,
            confidence: 1.0,
            parser: name,
          };
        }
      } catch (err) {
        console.error(`[Parser] Error in ${name} parser:`, err.message);
      }
    }
  }

  return null; // Unmatched — will be queued for LLM batch
}

/**
 * Get list of registered parser names (for diagnostics).
 */
function getRegisteredParsers() {
  return parserRegistry.map((r) => r.name);
}

module.exports = { parse, getRegisteredParsers };
