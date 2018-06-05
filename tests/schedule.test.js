var system = require('../lib/system.js');

describe('Schedule Manipulation', function(){
  const schedule = '0,1,2,3,4,5,6(7)|1(5);[9:15]';
  const schedule2 = '1,3,5(4)|1(10)|6(3);[23:59]';

  // Tests for parsing the schedule string into an object
  test('Schedule parsing', function () {
    var scheduleObj = system.parseSchedule(schedule);
    var scheduleObj2 = system.parseSchedule(schedule2);
    expect(scheduleObj).toEqual({
      time : { minutes : 15, hours : 9 },
      daysSets : [ { number : 7, days : [0,1,2,3,4,5,6] },
        { number : 5,days : [1] } ]
    });
    expect(scheduleObj2).toEqual(expect.objectContaining({
      time : { minutes : 59, hours : 23 }
    }),);
    expect(scheduleObj2.daysSets).toHaveLength(3);
  });


  // Testing getting the next scheduled time given the schedule and a date
  // NOTE: These tests cannot be implemented until there is a way to input a relative date to the function
  // TODO: Reorganize getNextScheduledTime to take in a date
  test('Same day scheduled time', function() {
    var nextSummaryDate = system.__getNextScheduledTime(schedule, new Date('Sun May 20 2018 08:20:00 GMT-0500 (CDT)'));
    expect(nextSummaryDate).toEqual(new Date('Sun May 20 2018 09:15:00 GMT-0500 (CDT)'));
  });
  test('Next day scheduled time', function() {
    var nextSummaryDate1_1 = system.__getNextScheduledTime(schedule, new Date('Wed May 23 2018 23:59:00 GMT-0500 (CDT)'));
    expect(nextSummaryDate1_1).toEqual(new Date('Thu May 24 2018 09:15:00 GMT-0500 (CDT)'));
  });
  test('Next day scheduled time', function() {
    var nextSummaryDate2 = system.__getNextScheduledTime(schedule, new Date('Sat May 26 2018 10:15:00 GMT-0500 (CDT)'));
    expect(nextSummaryDate2).toEqual(new Date('Sun May 27 2018 09:15:00 GMT-0500 (CDT)'));
  });
  test('Same day scheduled time', function() {
    var nextSummaryDate3 = system.__getNextScheduledTime(schedule2, new Date('Sat May 26 2018 00:00:00 GMT-0500 (CDT)'));
    expect(nextSummaryDate3).toEqual(new Date('Sat May 26 2018 23:59:00 GMT-0500 (CDT)'));
  });
  test('Future scheduled time', function() {
    var nextSummaryDate4 = system.__getNextScheduledTime(schedule2, new Date('Wed May 23 2018 23:59:30 GMT-0500 (CDT)'));
    expect(nextSummaryDate4).toEqual(new Date('Fri May 25 2018 23:59:00 GMT-0500 (CDT)'));
  });
});

test('Getting next summary time', function () {
  const schedule = '1;[8:00]';
  const schedule2 = '1,3;[14:00]';
  var lastSummaryDate = system.__getLastSummaryEmailTime(schedule, new Date('Mon May 28 2018 07:59:59 GMT-0500 (CDT)'));
  expect(lastSummaryDate).toEqual(new Date('Mon May 21 2018 08:00:00 GMT-0500 (CDT)'));
  
  var lastSummaryDate2 = system.__getLastSummaryEmailTime(schedule2, new Date('Mon May 28 2018 07:59:59 GMT-0500 (CDT)'));
  expect(lastSummaryDate2).toEqual(new Date('Wed May 23 2018 14:00:00 GMT-0500 (CDT)'));

  var lastSummaryDate3 = system.__getLastSummaryEmailTime(schedule2, new Date('Tue May 29 2018 12:00:00 GMT-0500 (CDT)'));
  expect(lastSummaryDate3).toEqual(new Date('Mon May 28 2018 14:00:00 GMT-0500 (CDT)'));
});
