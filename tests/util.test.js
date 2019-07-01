const util = require('../lib/util.js');

// Test util.getTimeSinceDate(prevDate, date)
describe('Testing util.getTimeSinceDate()', () => {
  test('Same time', () => {
    const now = new Date();
    const now2 = new Date(now.getTime());
    expect(util.getTimeSinceDate(now, now2)).toBe("Backup just occurred");
  });
});
