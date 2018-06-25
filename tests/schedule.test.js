var system = require('../lib/system.js');
var init = require('../lib/config/init.js');

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
  test('1 second before', function() {
    var nextSummaryDate = system.__getNextScheduledTime(schedule, new Date('Sun May 20 2018 09:14:59 GMT-0500 (CDT)'));
    expect(nextSummaryDate).toEqual(new Date('Sun May 20 2018 09:15:00 GMT-0500 (CDT)'));
  });
  test('1 second after', function() {
    var nextSummaryDate2 = system.__getNextScheduledTime(schedule, new Date('Wed May 23 2018 09:15:01 GMT-0500 (CDT)'));
    expect(nextSummaryDate2).toEqual(new Date('Thu May 24 2018 09:15:00 GMT-0500 (CDT)'));
  });
  test('1 second before midnight', function() {
    var nextSummaryDate3 = system.__getNextScheduledTime(schedule, new Date('Sat May 26 2018 23:59:59 GMT-0500 (CDT)'));
    expect(nextSummaryDate3).toEqual(new Date('Sun May 27 2018 09:15:00 GMT-0500 (CDT)'));
  });
  test('1 second after midnight', function() {
    var nextSummaryDate4 = system.__getNextScheduledTime(schedule, new Date('Sun May 27 2018 00:00:01 GMT-0500 (CDT)'));
    expect(nextSummaryDate4).toEqual(new Date('Sun May 27 2018 09:15:00 GMT-0500 (CDT)'));
  });
  test('Same time as scheduled', function() {
    var nextSummaryDate4 = system.__getNextScheduledTime(schedule2, new Date('Sat May 26 2018 23:59:00 GMT-0500 (CDT)'));
    expect(nextSummaryDate4).toEqual(new Date('Mon May 28 2018 23:59:00 GMT-0500 (CDT)'));
  });
  test('Future scheduled time', function() {
    var nextSummaryDate5 = system.__getNextScheduledTime(schedule2, new Date('Wed May 23 2018 23:59:01 GMT-0500 (CDT)'));
    expect(nextSummaryDate5).toEqual(new Date('Fri May 25 2018 23:59:00 GMT-0500 (CDT)'));
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

describe('Validating backup schedule', function() {
  const validSchedules = ['1(5);[8:00]','1(1);[08:00]',
    '0,1,2,3,4,5,6(7);[23:59]','6(6)|1,2,3(3);[0:00]'];
  const invalidSchedules = ['1;[8:00]','1(1);[24:00]','1(1);[60:00]',
    '1(1);[8:60]','7(1);[14:00]','1(1);[8:00:00]','1(4)|7(4);[9:01]',
    '|;[9:00]','[8:00]',];

  validSchedules.forEach(function(schedule) {
    test('Valid schedule testing',function() {
      expect(init.__validateBackupSchedule(schedule)).toEqual([]);
    });
  });
  
  test('Schedule w/o number of backups', function() {
    expect(init.__validateBackupSchedule(invalidSchedules[0]))
      .toEqual(['Backup schedule :' + invalidSchedules[0] + ' does not '+ 
      'match d,d,d(N)|d,d,d,d(N);[hh:mm] format']);
  });

  test('Schedule w/ invalid time (hour >= 24)', function() {
    var schedule1 = invalidSchedules[1];
    var schedule2 = invalidSchedules[2];
    expect(init.__validateBackupSchedule(schedule1)).toEqual(['Backup ' +
    'Schedule: ' + schedule1 + 'contains an invalid time [hh:mm]']);
    expect(init.__validateBackupSchedule(schedule2)).toEqual(['Backup ' +
    'Schedule: ' + schedule2 + 'contains an invalid time [hh:mm]']);
  });

  test('Schedule w/ invalid time (min > 59)', function() {
    expect(init.__validateBackupSchedule(invalidSchedules[3]))
      /*.toEqual(['Backup Schedule :' + invalidSchedules[3] + 
      'contains an invalid time [hh:mm]']);*/
      .toEqual(['Backup schedule :' + invalidSchedules[3] + ' does not '+ 
      'match d,d,d(N)|d,d,d,d(N);[hh:mm] format']);
  });

  test('Schedule with date greater than 6', function() {
    expect(init.__validateBackupSchedule(invalidSchedules[4]))
      .toEqual(['Backup schedule :' + invalidSchedules[4] + ' does not ' +
      'match d,d,d(N)|d,d,d,d(N);[hh:mm] format']);
  });

  test('Schedule with seconds in time stamp', function() {
    expect(init.__validateBackupSchedule(invalidSchedules[5]))
      .toEqual(['Backup schedule :' + invalidSchedules[5] + ' does not ' +
      'match d,d,d(N)|d,d,d,d(N);[hh:mm] format']);
  });

  test('Second schedule invalid date', function() {
    expect(init.__validateBackupSchedule(invalidSchedules[6]))
      .toEqual(['Backup schedule :' + invalidSchedules[6] + ' does not ' +
      'match d,d,d(N)|d,d,d,d(N);[hh:mm] format']);
  });

  test('No date set specified, only pipe',function() {
    expect(init.__validateBackupSchedule(invalidSchedules[7]))
      .toEqual(['Backup schedule :' + invalidSchedules[7] + ' does not ' +
      'match d,d,d(N)|d,d,d,d(N);[hh:mm] format']);
  });

  test('No date set specified', function() {
    expect(init.__validateBackupSchedule(invalidSchedules[8]))
      .toEqual(['Backup schedule :' + invalidSchedules[8] + ' does not ' +
      'match d,d,d(N)|d,d,d,d(N);[hh:mm] format']);
  });
});
