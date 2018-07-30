const system = require('../lib/system.js'),
      util = require('../lib/util.js'),
      path = require('path'),
      fs = require('fs-extra');

const dir = path.join(__dirname,'tmp','backup_test');

beforeEach(() => {
  if (fs.existsSync(dir))
    fs.removeSync(dir);
  fs.mkdirSync(dir);
});

afterEach(() => {
  if (fs.existsSync(dir))
    fs.removeSync(dir);
  fs.mkdirSync(dir);
});

// Testing bucket generation from a schedule object and date
describe('Bucket creation', () => {
  test('Bucket creation', () => {
    const schedule = '0,1,2,3,4,5,6(7)|1,3,5(12);0:00';
    const schedule2 = '1,3,5(6)|5(5);3:00';
    // 2015-01-01T07:00:00.000Z
    const date = new Date(1420095600000);
    // 2016-01-03T10:00:00.000Z
    const date2 = new Date(1451815200000);
    const buckets = system.getBuckets(schedule, date);
    const buckets2 = system.getBuckets(schedule2, date2);
    
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
});
// Testing bucket filling given directory structure and bucket
describe('Fill buckets', () => {
  test('Filling buckets', () => {
    const buckets = [ { date: new Date('Apr 16 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 18 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 20 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 21 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 22 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 23 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 25 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 27 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 28 2016 03:00:00 GMT-0500 (CDT)') },
                    { date: new Date('Apr 29 2016 03:00:00 GMT-0500 (CDT)') }];
    const machine = { name: 'test' };
    system.fillBuckets(buckets, dir, machine, () => {
      expect(buckets).toEqual([
          { date: new Date('Sat Apr 16 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Mon Apr 18 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Wed Apr 20 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Thu Apr 21 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Fri Apr 22 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Sat Apr 23 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Mon Apr 25 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Wed Apr 27 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Thu Apr 28 2016 03:00:00 GMT-0500 (CDT)') },
          { date: new Date('Fri Apr 29 2016 03:00:00 GMT-0500 (CDT)') } ]);
    });
  });
});
// Testing removing directories without current backup
// NOTE: This test itself relies on directories existing on the file system, 
// so the function getDirectoriestoRemove should be reorganized so
// that if we run tests on the server that this is not necessary
describe('Removing backups', () => {
  test('Removing correct backups', function(done) {
    const buckets = [
         { date: new Date('Sat Apr 16 2016 03:00:00 GMT-0500 (CDT)') },
         { backup: new Date('Mon Apr 18 2016 03:00:00 GMT-0500 (CDT)'), date: new Date('Mon Apr 18 2016 03:00:00 GMT-0500 (CDT)') },
         { backup: new Date('Wed Apr 20 2016 03:00:00 GMT-0500 (CDT)'), date: new Date('Wed Apr 20 2016 03:00:00 GMT-0500 (CDT)') },
         { backup: new Date('Fri Apr 22 2016 04:00:00 GMT-0500 (CDT)'), date: new Date('Fri Apr 22 2016 04:00:00 GMT-0500 (CDT)') },
         { backup: new Date('Sat Apr 23 2016 03:00:00 GMT-0500 (CDT)'), date: new Date('Sat Apr 23 2016 03:00:00 GMT-0500 (CDT)') },
         { backup: new Date('Mon Apr 25 2016 03:00:00 GMT-0500 (CDT)'), date: new Date('Mon Apr 25 2016 03:00:00 GMT-0500 (CDT)') },
         { backup: new Date('Wed Apr 27 2016 03:00:00 GMT-0500 (CDT)'), date: new Date('Wed Apr 27 2016 03:00:00 GMT-0500 (CDT)') },
         { backup: new Date('Thu Apr 28 2016 03:00:00 GMT-0500 (CDT)'), date: new Date('Thu Apr 28 2016 03:00:00 GMT-0500 (CDT)') } ];
    
    buckets.forEach( bucket => {
      fs.mkdirSync(path.join(dir, bucket.date.toISOString()));
    });

    function callback(removedDirectories) {
      expect(removedDirectories).toEqual([path.join(dir, new Date('Sat Apr 16 2016 03:00:00 GMT-0500 (CDT)').toISOString())]);
      done();
    };
    system.getDirectoriesToRemove(dir, buckets, callback);
  });
});

// Testing converting schedule into a human readable format
describe('Human readable format', () => {
  test('Human Readable schedule format', () => {
    const scheduleObj = util.parseSchedule('0,1,2,3,4,5,6(7)|1(5);3:00');
    expect(scheduleObj).toEqual({ time: { hours: 3, minutes: 0 },
          daysSets: [ { number: 7, days: [0,1,2,3,4,5,6] }, { number: 5, days: [1] } ] 
    });
    expect(util.convertSchedObjToReadable(scheduleObj)).toEqual('Last 7 Days Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday\nLast 5 Days Monday\n  at 3 a.m.');
  });
});

