const init = require('../lib/config/init.js');

// This function takes a string as an input and returns if it is an
// integer greater than or equal to 0
describe('Verifying isPositiveInteger function', () => {
  test('Strings with numbers are positive integers', () => {
    expect(init.__isPositiveInteger('5')).toBe(true);
  });
  test('Strings with alpha chars are not positive integers', () => {
    expect(init.__isPositiveInteger('a')).toBe(false);
  });
  test('Hex strings are not positive integers', () => {
    expect(init.__isPositiveInteger('1F3')).toBe(false);
  });
  test('Inf is not a positive integer', () => {
    expect(init.__isPositiveInteger(Infinity)).toBe(false);
  });
  test('Arrays are not positive integers', () => {
    expect(init.__isPositiveInteger([1,2])).toBe(false);
  });
  test('Null is not a positive integer', () => {
    expect(init.__isPositiveInteger(null)).toBe(false);
  });
});
