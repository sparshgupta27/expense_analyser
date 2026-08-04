const { runFixtures } = require('./parser-harness');
const hdfcParser = require('../../src/parsers/hdfc');

describe('HDFC Bank parser', () => {
  runFixtures('hdfc', hdfcParser);
});
