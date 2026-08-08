/**
 * Universal Indian Date Parser
 * Handles all Indian bank email date formats (DD-MMM-YYYY, DD/MM/YY, ISO, etc.)
 */

const MONTH_MAP = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function parseIndianDate(dateStr, fallbackDate = new Date()) {
  if (!dateStr || typeof dateStr !== 'string') return fallbackDate;

  const clean = dateStr.trim();

  // 1. DD-MMM-YYYY or DD-MMM-YY (e.g. 04-Aug-2026, 04-AUG-26, 4 Aug 2026)
  const alphaMatch = clean.match(/(\d{1,2})[\s\-\/]+([a-zA-Z]{3,9})[\s\-\/]+(\d{2,4})/);
  if (alphaMatch) {
    let [, day, mStr, year] = alphaMatch;
    const monthIdx = MONTH_MAP[mStr.toLowerCase()];
    if (monthIdx !== undefined) {
      if (year.length === 2) year = '20' + year;
      const d = new Date(parseInt(year, 10), monthIdx, parseInt(day, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 2. MMM DD, YYYY or MMM DD YYYY (e.g. Aug 4, 2026, August 4 2026)
  const monthFirstMatch = clean.match(/([a-zA-Z]{3,9})[\s\-\/]+(\d{1,2}),?[\s\-\/]+(\d{2,4})/);
  if (monthFirstMatch) {
    let [, mStr, day, year] = monthFirstMatch;
    const monthIdx = MONTH_MAP[mStr.toLowerCase()];
    if (monthIdx !== undefined) {
      if (year.length === 2) year = '20' + year;
      const d = new Date(parseInt(year, 10), monthIdx, parseInt(day, 10));
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 3. DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY or DD-MM-YY (e.g. 04-08-2026, 04/08/26)
  const numMatch = clean.match(/(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})/);
  if (numMatch) {
    let [, day, month, year] = numMatch;
    if (year.length === 2) year = '20' + year;
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    if (!isNaN(d.getTime())) return d;
  }

  // 4. ISO YYYY-MM-DD
  const isoMatch = clean.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback to standard JavaScript Date parser
  const parsed = new Date(clean);
  return isNaN(parsed.getTime()) ? fallbackDate : parsed;
}

module.exports = { parseIndianDate };
