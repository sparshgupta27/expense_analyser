const { runFixtures } = require('./parser-harness');
const gpayParser = require('../../src/parsers/gpay');

describe('Google Pay parser', () => {
  runFixtures('gpay', gpayParser);
});
