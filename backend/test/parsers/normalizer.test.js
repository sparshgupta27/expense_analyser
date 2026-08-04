/**
 * Unit tests for merchant name normalizer.
 */
const { normalize } = require('../../src/services/merchantNormalizer');

describe('Merchant Normalizer', () => {
  test('strips order IDs after asterisk', () => {
    expect(normalize('SWIGGY*ORDER8827321')).toBe('Swiggy');
  });

  test('strips long numeric sequences', () => {
    expect(normalize('UBER TRIP 1234567890')).toBe('Uber Trip');
  });

  test('strips corporate suffixes', () => {
    expect(normalize('ZOMATO PVT LTD')).toBe('Zomato');
  });

  test('handles "India Technology" noise', () => {
    expect(normalize('UBER INDIA TECHNOLOGY PVT LTD')).toBe('Uber');
  });

  test('strips UPI references', () => {
    expect(normalize('DOMINOS via UPI')).toBe('Dominos');
  });

  test('returns Unknown for empty input', () => {
    expect(normalize('')).toBe('Unknown');
    expect(normalize(null)).toBe('Unknown');
  });

  test('applies title case', () => {
    expect(normalize('AMAZON')).toBe('Amazon');
    expect(normalize('netflix')).toBe('Netflix');
  });

  test('strips ref numbers', () => {
    expect(normalize('FLIPKART ref no 12345678')).toBe('Flipkart');
  });
});
