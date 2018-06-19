var init = require('../lib/config/init.js');

describe('Verifying isNumeric function', function(){
  test('Integers are numeric', function() {
    expect(init.__isNumeric(5)).toBe(true);
  });
  test('Strings are not numeric', function() {
    expect(init.__isNumeric('5')).toBe(false);
  });
  test('Arrays are not numeric', function() {
    expect(init.__isNumeric([1,2])).toBe(false);
  });
  test('Null is not numeric', function() {
    expect(init.__isNumeric(null)).toBe(false);
  });
});

describe('Parsing config object for notification settings', function() {
  var config = {};

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
      'email@-domain.com','email@domain.web','email@111.222.333.44444',
      'email@domain..com'];
    validEmails.forEach(function(email) {
      beforeEach(function() {
        config.notifications.email_to = email;
      });

      test('Valid emails', function() {
        expect(init.__validateNotifications(config)).toEqual([]);
      });
    });
  });
});
