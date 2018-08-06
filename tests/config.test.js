const config = require('../lib/config/init.js');

// This function takes a string or number as an input and returns true if it is
// an integer, or representing an integer greater than or equal to 1.
describe('Verifying isPositiveInteger function', () => {
  test('Strings with numbers are positive integers', () => {
    expect(config.__isPositiveInteger('5')).toBe(true);
  });
  test('Strings with floating numbers are not integers', () => {
    expect(config.__isPositiveInteger('0.5')).toBe(false);
  });
  test('Strings with negative integers are not positive integers', () => {
    expect(config.__isPositiveInteger('-2')).toBe(false);
  });
  test('Large string integers are positive integers', () => {
    expect(config.__isPositiveInteger('999999999999')).toBe(true);
  });
  test('Strings with alpha chars are not positive integers', () => {
    expect(config.__isPositiveInteger('a')).toBe(false);
  });
  test('Hex strings are not positive integers', () => {
    expect(config.__isPositiveInteger('1F3')).toBe(false);
  });
  test('Inf is not a positive integer', () => {
    expect(config.__isPositiveInteger(Infinity)).toBe(false);
  });
  test('Arrays are not positive integers', () => {
    expect(config.__isPositiveInteger([1,2])).toBe(false);
  });
  test('Zero is not a positive integer', () => {
    expect(config.__isPositiveInteger('0')).toBe(false);
  });
  test('Numbers can be used as inputs', () => {
    expect(config.__isPositiveInteger(1)).toBe(true);
  });
  test('Specified maximum cannot be exceeded', () => {
    expect(config.__isPositiveInteger(2, 1)).toBe(false);
  });
  test('Specified maximum is obeyed', () => {
    expect(config.__isPositiveInteger(1, 2)).toBe(true);
  });
  test('Specified maximum is obeyed', () => {
    expect(config.__isPositiveInteger('1', 2)).toBe(true);
  });

  // Need the anonymous function to test for thrown Error
  test('Specified maximum cannot be a string', () => {
    expect(() => {
      config.__isPositiveInteger('10', '2')
    }).toThrow();
  });
  test('Null is not a positive integer', () => {
    expect(config.__isPositiveInteger(null)).toBe(false);
  });
});
