var system = require('../lib/system.js');
var path = require('path');

// Tests for parsing the schedule string into an object
test('Schedule parsing', function () {
  var schedule = '0,1,2,3,4,5,6(7)|1(5);[9:15]';
  var schedule2 = '1,3,5(4)|1(10)|6(3);[23:59]';
  var scheduleObj = system.parseSchedule(schedule);
  var scheduleObj2 = system.parseSchedule(schedule2);
  expect(scheduleObj).toEqual({
    time : { minutes : 15, hours : 9 },
    daysSets : [{ number : 7, days : [0,1,2,3,4,5,6] },
      {number : 5,days : [1]}]
  });
  expect(scheduleObj2).toEqual(expect.objectContaining({
    time : { minutes : 59, hours : 23 }
  }),
  );
  expect(scheduleObj2.daysSets).toHaveLength(3);
});

// Test finding the next expected backup date given date and schedule object
// NOTE: getNextScheduledTime(scheduleStr) is not a public method
// This test will have to change slightly since the function implemented 
//    does not rely  on a date provided to calculate the next backup
/*
test('Find next scheduled backup time', function() {
  var date = new Date('2016-04-22');
  var date2 = new Date('2015-12-31');
  date2.setHours(9);
  date2.setMinutes(15);
  var schedule = '0,2(7)|1(5);[9:15]';
  var nextBackup = system.getNextScheduledTime()
});
*/

// Testing bucket generation from a schedule object and date
test('Bucket creation', function() {
  var schedule = '0,1,2,3,4,5,6(7)|1,3,5(12);0:00';
  var schedule2 = '1,3,5(6)|5(5);3:00';
  var date = new Date(1420095600000);
  var date2 = new Date(1451815200000);

  var buckets = system.getBuckets(schedule, date);
  var buckets2 = system.getBuckets(schedule2, date2);
  
  expect(buckets).toEqual( [{ date: new Date('Fri Dec 05 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Mon Dec 08 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Wed Dec 10 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Fri Dec 12 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Mon Dec 15 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Wed Dec 17 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Fri Dec 19 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Mon Dec 22 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Wed Dec 24 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Fri Dec 26 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Sat Dec 27 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Sun Dec 28 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Mon Dec 29 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Tue Dec 30 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Wed Dec 31 2014 00:00:00 GMT-0600 (CST)') },
      { date: new Date('Thu Jan 01 2015 00:00:00 GMT-0600 (CST)') } ]);

  expect(buckets2).toEqual([ { date: new Date('Fri Dec 04 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Fri Dec 11 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Fri Dec 18 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Mon Dec 21 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Wed Dec 23 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Fri Dec 25 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Mon Dec 28 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Wed Dec 30 2015 03:00:00 GMT-0600 (CST)') },
      { date: new Date('Fri Jan 01 2016 03:00:00 GMT-0600 (CST)') } ]);
});
