var buckets = require('./buckets.js');

var schedule = '0,1,2,3,4,5,6(7)|1(5)_[3:01]';
var date = new Date('2016-14-Jan_09:54');
var bucketsVar = buckets.getBuckets(schedule, date);
console.log('Buckets:');
bucketsVar.forEach(function(bucket) {
  console.log('  ' + bucket.date);
});
var dir = '../../resources/test_backups/';
buckets.fillBuckets(bucketsVar, dir, buckets.getRemovedDirectoriesList);


//var removedDirs = buckets.getRemovedDirectoriesList(dir, bucketsVar);


console.log('\nNext scheduled time: ' + buckets.findNextScheduledTime(schedule, new Date()));
