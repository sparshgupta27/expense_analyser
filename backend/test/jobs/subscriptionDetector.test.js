const { amountsMatch, matchesInterval } = require('../../src/jobs/subscriptionDetector');

describe('Subscription Detector Helpers', () => {
  describe('amountsMatch', () => {
    test('returns true for exact same amounts', () => {
      expect(amountsMatch(649, 649)).toBe(true);
    });

    test('returns true for amounts within 5% tolerance', () => {
      expect(amountsMatch(100, 104)).toBe(true);
      expect(amountsMatch(100, 96)).toBe(true);
    });

    test('returns false for amounts outside 5% tolerance', () => {
      expect(amountsMatch(100, 120)).toBe(false);
      expect(amountsMatch(500, 600)).toBe(false);
    });

    test('returns false if any amount is zero', () => {
      expect(amountsMatch(0, 100)).toBe(false);
      expect(amountsMatch(100, 0)).toBe(false);
    });
  });

  describe('matchesInterval', () => {
    test('identifies monthly subscription cycle (30 days)', () => {
      expect(matchesInterval(30)).toBe(30);
      expect([28, 30]).toContain(matchesInterval(29));
      expect(matchesInterval(31)).toBe(31);
    });

    test('identifies weekly subscription cycle (7 days)', () => {
      expect(matchesInterval(7)).toBe(7);
      expect(matchesInterval(8)).toBe(7);
    });

    test('identifies annual subscription cycle (365 days)', () => {
      expect(matchesInterval(365)).toBe(365);
      expect(matchesInterval(364)).toBe(365);
    });

    test('returns null for irregular intervals', () => {
      expect(matchesInterval(45)).toBeNull();
      expect(matchesInterval(120)).toBeNull();
    });
  });
});
