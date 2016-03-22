var system = require('./system');

var schedule = '0,1,2,3,4,5,6(7)|1(5);9:15';
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
