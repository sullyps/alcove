var test = require('tape');
var system = require('./system');

var schedule = '0,1,2,3,4,5,6(7)|1(5);9:15';

// Tests for parsing the schedule string into an object.
test('schedule parsing', function(assert) {
  assert.plan(1);
  
});

// Testing bucket generation from a schedule object


//Testing filling buckets given a directory structure and buckets.


// Testing finding the next expected backup date given date and schedule.



// Identify which backups to remove given schedule and directory





// var dir = '../../resources/test_backups_2/';
var dir = '~/backupTest/beta/';
var date = new Date('2016-02-Jan-03:02');

var bucketsVar = system.getBuckets(schedule, date);
console.log('Buckets:');
bucketsVar.forEach(function(bucket) {
  console.log('  ' + bucket.date);
});
//buckets.fillBuckets(bucketsVar, dir, buckets.removeDirectories);
system.fillBuckets(bucketsVar, dir, machine, system.listDirectoriesToRemove, {console.log('running backup');});
console.log('\nNext scheduled time: ' + buckets.findNextScheduledTime(schedule, date));
