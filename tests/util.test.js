const util = require('../lib/util.js');

// Test util.getTimeSinceDate(prevDate, date)
describe('Testing util.getTimeSinceDate()', () => {
  test('Same time', () => {
    var now = new Date();
    var now2 = new Date(now.getTime());
    expect(util.getTimeSinceDate(now, now2)).toBe("Backup just occurred");
  });
});
