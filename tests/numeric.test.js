var init = require('../lib/config/init.js');

describe('Verifying isNumeric function', function(){
  test('Integers are numeric', function() {
    expect(init.__isNumeric(5)).toBe(true);
  });
  test('Strings with numbers are numeric', function() {
    expect(init.__isNumeric('5')).toBe(true);
  });
  test('Strings with alpha chars are not numeric', function() {
    expect(init.__isNumeric('a')).toBe(false);
  });
  test('Hex strings are not numeric', function() {
    expect(init.__isNumeric('1F3')).toBe(false);
  });
  test('Inf is not numeric', function() {
    expect(init.__isNumeric(Infinity)).toBe(false);
  });
  test('Arrays are not numeric', function() {
    expect(init.__isNumeric([1,2])).toBe(false);
  });
  test('Null is not numeric', function() {
    expect(init.__isNumeric(null)).toBe(false);
  });
});
