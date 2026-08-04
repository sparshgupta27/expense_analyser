const { runFixtures } = require('./parser-harness');
const phonepeParser = require('../../src/parsers/phonepe');

describe('PhonePe parser', () => {
  runFixtures('phonepe', phonepeParser);
});
