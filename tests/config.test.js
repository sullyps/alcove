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

describe('Parsing config object for notification settings', function() {
  describe('Testing email addresses', function() {
    // Per this post - https://blogs.msdn.microsoft.com/testing123/2009/02/06/email-address-test-cases/
    const validEmails = ['email@domain.com','firstname.lastname@domain.com',
      'email@subdomain.domain.com','firstname+lastname@domain.com',
      'email@123.123.123.123','email@[123.123.123.123]','"email"@domain.com',
      '1234567890@domain.com','email@domain-one.com','_______@domain.com',
      'email@domain.name','email@domain.co.jp','firstname-lastname@domain.com'];
    const invalidEmails = ['plainaddress','#@%^%#$@#$@#.com','@domain.com',
      'Joe Smith <email@domain.com>','email.domain.com',
      'email@domain@domain.com','.email@domain.com','email.@domain.com',
      'email..email@domain.com','email@domain.com (Joe Smith)','email@domain',
      'email@-domain.com','email@domain..com'];

    validEmails.forEach(function(email) {
      let config = { notifications : { email_to : [] } };
      config.notifications.email_to.push(email);
      test('Valid emails', function() {
        expect(init.__validateNotifications(config)).toEqual([]);
      });
    });
    
    // The current regex being used fails to invalidate 'email@domain.web'
    // and 'email@111.222.333.44444'.
    // The first fails because there is no check for all top level domains.
    // The second fails because the check for domain names that start with 
    // numbers.
    
    let totalErrors = [];
    
    invalidEmails.forEach(function(email) {
      let config = { notifications : { email_to : [] }};
      let error = [];
      error.push('Invalid email address: ' + email);
      totalErrors.push('Invalid email address: ' + email);
      config.notifications.email_to.push(email);
      test('Individual invalid emails', function() {
        expect(init.__validateNotifications(config)).toEqual(error);
      });
    });

    test('All invalid emails', function() {
      let config = { notifications : { email_to : invalidEmails }}
      expect(init.__validateNotifications(config)).toEqual(totalErrors);
    });

    test('Both valid and invalid emails', function() {
      let config = { notifications : 
        { email_to : validEmails.concat(invalidEmails) }
      };
      expect(init.__validateNotifications(config)).toEqual(totalErrors);
    });

  });
});
