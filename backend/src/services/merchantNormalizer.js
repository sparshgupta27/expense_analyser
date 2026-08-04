/**
 * Merchant Name Normalizer
 *
 * Strips transaction IDs, reference numbers, and suffixes from raw
 * merchant names to produce a clean, consistent normalized form.
 */

/**
 * Normalize a raw merchant name.
 * "SWIGGY*ORDER8827321" → "Swiggy"
 * "UBER INDIA TECHNOLOGY PVT LTD" → "Uber India Technology"
 */
function normalize(merchantRaw) {
  if (!merchantRaw) return 'Unknown';

  let name = merchantRaw
    // Strip everything after * (common in card statements)
    .replace(/\*.*$/, '')
    // Strip long numeric sequences (order/reference IDs)
    .replace(/[0-9]{6,}/g, '')
    // Strip short IDs after common prefixes
    .replace(/#\s*\w+/g, '')
    // Strip common suffixes
    .replace(/\s*(?:pvt|private|ltd|limited|inc|llp|llc)\s*/gi, '')
    // Strip "India", "Technology", etc. which add noise (each independently)
    .replace(/\b(?:india|technology|technologies|solutions)\b/gi, '')
    // Strip payment method references
    .replace(/\s*(?:via\s+)?(?:UPI|NEFT|IMPS|RTGS|PhonePe|GPay|Paytm)\s*/gi, '')
    // Strip reference numbers
    .replace(/\s*ref\s*(?:no|number)?\.?\s*[\w\-]+/gi, '')
    .replace(/\s*txn\s*(?:no|id)?\.?\s*[\w\-]+/gi, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    // Strip leading/trailing whitespace and punctuation
    .replace(/^[\s\-_.*]+|[\s\-_.*]+$/g, '')
    .trim();

  if (!name) return 'Unknown';

  // Title case
  name = name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return name;
}

module.exports = { normalize };
