var buckets = require('./buckets.js');

var schedule = '0,1,2(6)|1(5)_[3:01]';
var dir = '../../resources/test_backups_2/';
var date = new Date('2016-02-Jan-03:02');

var bucketsVar = buckets.getBuckets(schedule, date);
console.log('Buckets:');
bucketsVar.forEach(function(bucket) {
  console.log('  ' + bucket.date);
});
//buckets.fillBuckets(bucketsVar, dir, buckets.removeDirectories);
buckets.fillBuckets(bucketsVar, dir, buckets.listDirectoriesToRemove);
console.log('\nNext scheduled time: ' + buckets.findNextScheduledTime(schedule, date));
