const system = require('../lib/system.js');
const config = require('../lib/config/init.js');

describe('Schedule Manipulation', () => {
  const schedule = '0,1,2,3,4,5,6(7)|1(5);[9:15]';
  const schedule2 = '1,3,5(4)|1(10)|6(3);[23:59]';

  describe('Parse schedule into object', () => {
    test('Schedule parsing', () => {
      let scheduleObj = system.parseSchedule(schedule);
      let scheduleObj2 = system.parseSchedule(schedule2);

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
  });

  describe('Get upcoming date based on schedule', () => {

    test('1 second before', () => {
      let nextSummaryDate = system.__getNextScheduledTime(schedule, new Date('Sun May 20 2018 09:14:59 GMT-0500 (CDT)'));
      expect(nextSummaryDate).toEqual(new Date('Sun May 20 2018 09:15:00 GMT-0500 (CDT)'));
    });

    test('1 second after', () => {
      let nextSummaryDate2 = system.__getNextScheduledTime(schedule, new Date('Wed May 23 2018 09:15:01 GMT-0500 (CDT)'));
      expect(nextSummaryDate2).toEqual(new Date('Thu May 24 2018 09:15:00 GMT-0500 (CDT)'));
    });

    test('1 second before midnight', () => {
      let nextSummaryDate3 = system.__getNextScheduledTime(schedule, new Date('Sat May 26 2018 23:59:59 GMT-0500 (CDT)'));
      expect(nextSummaryDate3).toEqual(new Date('Sun May 27 2018 09:15:00 GMT-0500 (CDT)'));
    });

    test('1 second after midnight', () => {
      let nextSummaryDate4 = system.__getNextScheduledTime(schedule, new Date('Sun May 27 2018 00:00:01 GMT-0500 (CDT)'));
      expect(nextSummaryDate4).toEqual(new Date('Sun May 27 2018 09:15:00 GMT-0500 (CDT)'));
    });

    test('Same time as scheduled', () => {
      let nextSummaryDate5 = system.__getNextScheduledTime(schedule2, new Date('Sat May 26 2018 23:59:00 GMT-0500 (CDT)'));
      expect(nextSummaryDate5).toEqual(new Date('Mon May 28 2018 23:59:00 GMT-0500 (CDT)'));
    });

    test('Future scheduled time', () => {
      let nextSummaryDate6 = system.__getNextScheduledTime(schedule2, new Date('Wed May 23 2018 23:59:01 GMT-0500 (CDT)'));
      expect(nextSummaryDate6).toEqual(new Date('Fri May 25 2018 23:59:00 GMT-0500 (CDT)'));
    });

  });
});

test('Getting next summary time', () => {
  const schedule = '1;[8:00]';
  const schedule2 = '1,3;[14:00]';

  let lastSummaryDate = system.__getLastSummaryEmailTime(schedule, new Date('Mon May 28 2018 07:59:59 GMT-0500 (CDT)'));
  expect(lastSummaryDate).toEqual(new Date('Mon May 21 2018 08:00:00 GMT-0500 (CDT)'));
  
  let lastSummaryDate2 = system.__getLastSummaryEmailTime(schedule2, new Date('Mon May 28 2018 07:59:59 GMT-0500 (CDT)'));
  expect(lastSummaryDate2).toEqual(new Date('Wed May 23 2018 14:00:00 GMT-0500 (CDT)'));

  let lastSummaryDate3 = system.__getLastSummaryEmailTime(schedule2, new Date('Tue May 29 2018 12:00:00 GMT-0500 (CDT)'));
  expect(lastSummaryDate3).toEqual(new Date('Mon May 28 2018 14:00:00 GMT-0500 (CDT)'));
});

describe('Validating config schedule parsing', () => {
  const validSchedules = ['1(5);[8:00]','1(1);[08:00]',
    '0,1,2,3,4,5,6(7);[23:59]','6(6)|1,2,3(3);[0:00]'];

  const invalidSchedules = ['1;[8:00]','1(1);[24:00]','1(1);[60:00]',
    '1(1);[8:60]','7(1);[14:00]','1(1);[8:00:00]','1(4)|7(4);[9:01]',
    '|;[9:00]','[8:00]',];

  validSchedules.forEach((schedule) => {
    test('Valid schedule testing',() => {
      expect(config.__validateBackupSchedule(schedule)).toEqual([]);
    });
  });
  
  test('Schedule w/o number of backups', () => {
    expect(config.__validateBackupSchedule(invalidSchedules[0])).not.toBe([]);
  });

  test('Schedule w/ invalid time (hour >= 24)', () => {
    let schedule1 = invalidSchedules[1];
    let schedule2 = invalidSchedules[2];
    expect(config.__validateBackupSchedule(schedule1)).not.toBe([]);
    expect(config.__validateBackupSchedule(schedule2)).not.toBe([]);
  });

  test('Schedule w/ invalid time (min > 59)', () => {
    expect(config.__validateBackupSchedule(invalidSchedules[3])).not.toBe([]);
  });

  test('Schedule with date greater than 6', () => {
    expect(config.__validateBackupSchedule(invalidSchedules[4])).not.toBe([]);
  });

  test('Schedule with seconds in time stamp', () => {
    expect(config.__validateBackupSchedule(invalidSchedules[5])).not.toBe([]);
  });

  test('Second schedule invalid date', () => {
    expect(config.__validateBackupSchedule(invalidSchedules[6])).not.toBe([]);
  });

  test('No date set specified, only pipe', () => {
    expect(config.__validateBackupSchedule(invalidSchedules[7])).not.toBe([]);
  });

  test('No date set specified', () => {
    expect(config.__validateBackupSchedule(invalidSchedules[8])).not.toBe([]);
  });
});
