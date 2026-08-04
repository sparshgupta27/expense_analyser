/**
 * Parser Test Harness
 *
 * Automatically discovers fixture files in test/fixtures/{sender}/,
 * pairs each .html file with its .expected.json, runs the parser,
 * and asserts deep equality.
 *
 * Usage in test files:
 *   const { runFixtures } = require('./parser-harness');
 *   const hdfcParser = require('../../src/parsers/hdfc');
 *   describe('HDFC parser', () => { runFixtures('hdfc', hdfcParser); });
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

/**
 * Discover and run all fixtures for a given sender against a parser.
 * @param {string} sender - Sender directory name (e.g., 'hdfc')
 * @param {object} parser - Parser module with extract(subject, body) method
 */
function runFixtures(sender, parser) {
  const senderDir = path.join(FIXTURES_DIR, sender);

  if (!fs.existsSync(senderDir)) {
    test(`${sender} fixtures directory exists`, () => {
      throw new Error(`Fixtures directory not found: ${senderDir}`);
    });
    return;
  }

  const htmlFiles = fs
    .readdirSync(senderDir)
    .filter((f) => f.endsWith('.html'));

  if (htmlFiles.length === 0) {
    test(`${sender} has fixture files`, () => {
      throw new Error(`No .html fixtures found in ${senderDir}`);
    });
    return;
  }

  for (const htmlFile of htmlFiles) {
    const baseName = htmlFile.replace('.html', '');
    const expectedFile = `${baseName}.expected.json`;
    const subjectFile = `${baseName}.subject.txt`;

    test(`parses ${sender}/${baseName}`, () => {
      const bodyPath = path.join(senderDir, htmlFile);
      const expectedPath = path.join(senderDir, expectedFile);

      // Ensure expected output file exists
      expect(fs.existsSync(expectedPath)).toBe(true);

      const body = fs.readFileSync(bodyPath, 'utf8');
      const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

      // Load subject if it exists, otherwise use empty string
      const subjectPath = path.join(senderDir, subjectFile);
      const subject = fs.existsSync(subjectPath)
        ? fs.readFileSync(subjectPath, 'utf8').trim()
        : '';

      const result = parser.extract(subject, body);

      if (expected === null) {
        // Expect parser to return null (non-transaction email)
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result.amount).toBeCloseTo(expected.amount, 2);
        expect(result.merchant_raw).toBe(expected.merchant_raw);
        expect(result.transaction_type).toBe(expected.transaction_type);

        if (expected.account_last4) {
          expect(result.account_last4).toBe(expected.account_last4);
        }
      }
    });
  }
}

module.exports = { runFixtures };
