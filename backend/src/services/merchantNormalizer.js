/**
 * Merchant Name Normalizer & Cleaner
 *
 * Extracts clean, recognizable merchant names from raw bank alerts,
 * UPI handles, card descriptors, and reference codes.
 */

const BRAND_ALIASES = [
  { match: /\b(?:swiggy)\b/i, name: 'Swiggy' },
  { match: /\b(?:zomato)\b/i, name: 'Zomato' },
  { match: /\b(?:blinkit|grofers)\b/i, name: 'Blinkit' },
  { match: /\b(?:zepto)\b/i, name: 'Zepto' },
  { match: /\b(?:instamart)\b/i, name: 'Instamart' },
  { match: /\b(?:bigbasket)\b/i, name: 'Bigbasket' },
  { match: /\b(?:amazon|amzn)\b/i, name: 'Amazon' },
  { match: /\b(?:flipkart)\b/i, name: 'Flipkart' },
  { match: /\b(?:myntra)\b/i, name: 'Myntra' },
  { match: /\b(?:ajio)\b/i, name: 'Ajio' },
  { match: /\b(?:nykaa)\b/i, name: 'Nykaa' },
  { match: /\b(?:uber)\b/i, name: 'Uber' },
  { match: /\b(?:ola)\b/i, name: 'Ola' },
  { match: /\b(?:rapido)\b/i, name: 'Rapido' },
  { match: /\b(?:irctc)\b/i, name: 'IRCTC' },
  { match: /\b(?:netflix)\b/i, name: 'Netflix' },
  { match: /\b(?:spotify)\b/i, name: 'Spotify' },
  { match: /\b(?:airtel)\b/i, name: 'Airtel' },
  { match: /\b(?:jio)\b/i, name: 'Jio' },
  { match: /\b(?:bescom)\b/i, name: 'Bescom' },
  { match: /\b(?:bookmyshow)\b/i, name: 'BookMyShow' },
  { match: /\b(?:cred)\b/i, name: 'CRED' },
  { match: /\b(?:dominos)\b/i, name: 'Dominos' },
  { match: /\b(?:mcdonalds)\b/i, name: 'McDonalds' },
  { match: /\b(?:kfc)\b/i, name: 'KFC' },
  { match: /\b(?:starbucks)\b/i, name: 'Starbucks' },
  { match: /\b(?:dmarc|openai|chatgpt)\b/i, name: 'OpenAI' },
  { match: /\b(?:cursor)\b/i, name: 'Cursor' },
  { match: /\b(?:github)\b/i, name: 'GitHub' },
  { match: /\b(?:apple)\b/i, name: 'Apple' },
];

function normalize(merchantRaw) {
  if (!merchantRaw || typeof merchantRaw !== 'string') return 'Unknown';

  let raw = merchantRaw.trim();

  // Parse UPI paths like "UPI/DR/412345678901/BIGBASKET/YESB0BIGBAS/UPI"
  if (raw.includes('/') || raw.toUpperCase().includes('UPI')) {
    const parts = raw.split(/[\/\-]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      for (const { match, name } of BRAND_ALIASES) {
        if (match.test(part)) return name;
      }
    }
  }

  // Parse VPAs like "zomato@icici"
  if (raw.includes('@')) {
    const handle = raw.split('@')[0].trim();
    for (const { match, name } of BRAND_ALIASES) {
      if (match.test(handle)) return name;
    }
  }

  // Strip noise, numeric IDs, order IDs
  let name = raw
    .replace(/\*.*$/, '')                                         // Strip everything after *
    .replace(/[0-9]{6,}/g, '')                                    // Strip long numeric IDs
    .replace(/#\s*\w+/g, '')                                       // Strip #orderid
    .replace(/\s*(?:pvt|private|ltd|limited|inc|llp|llc|co)\s*/gi, '')
    .replace(/\b(?:technology|technologies|solutions|services|payments?)\b/gi, '')
    .replace(/\b(?:india)\b/gi, '')                               // Strip "India" independently
    .replace(/\s*(?:via\s+)?(?:UPI|NEFT|IMPS|RTGS|PhonePe|GPay|Paytm)\s*/gi, '')
    .replace(/\s*ref\s*(?:no|number)?\.?\s*[\w\-]+/gi, '')
    .replace(/\s*txn\s*(?:no|id)?\.?\s*[\w\-]+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-_.*]+|[\s\-_.*]+$/g, '')
    .trim();

  if (!name || /^\d+$/.test(name)) {
    if (/\b(?:atm|withdrawal)\b/i.test(merchantRaw)) return 'ATM Withdrawal';
    return 'Unknown';
  }

  // Exact single-word brand check (e.g. "UBER" -> "Uber", but "UBER TRIP" -> "Uber Trip")
  for (const { match, name: brandName } of BRAND_ALIASES) {
    if (match.test(name) && name.toLowerCase() === brandName.toLowerCase()) {
      return brandName;
    }
  }

  // Title case
  return name
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { normalize };
