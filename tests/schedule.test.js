var system = require('../lib/system.js');

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
