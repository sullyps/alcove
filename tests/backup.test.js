var rsync = require('../lib/rsync.js');
var fs = require('fs-extra');
const path = require('path');

// This will always be a relative path to the tests directory, where
// these tests are located.
var dir = path.join(__dirname,'tmp', 'backup-dirs');
var validDirectoryNames = ['2018-06-15T18:49:00.010Z','2018-06-15T18:49:00.000Z',
    '2018-06-14T18:49:00.010Z','2018-06-13T18:49:00.010Z'];
var invalidNames = ['incorrect-dir-name','2018-06-15','2018-06-15T18:49:00:000'];

// Before each test, remove old test file directory if it exists
// and create a new directory.
beforeEach(function() {
  if (fs.existsSync(dir))
    fs.removeSync(dir);
  console.log('Making test directory');
  fs.mkdirSync(dir);
});

// Always remove the directory with the simulated data after each test
afterEach(function() {
  if (fs.existsSync(dir))
  {
    fs.removeSync(dir);
    console.log('Removing test directory');
  }
});

describe('Only valid directories inside backup directory', function() {
  beforeEach(function() {
    validDirectoryNames.forEach(function(dirname) {
      fs.mkdirSync(path.join(dir, dirname));
    });
  });

  test('Get the most recent backup directory', function() {
    expect(rsync.getLastBackupDir(dir)).toBe(path.join(dir,'2018-06-15T18:49:00.010Z'));
  });
});

describe('Valid file names but no directories', function() {
  beforeEach(function() {
    validDirectoryNames.forEach(function(dirname) {
      fs.writeFileSync(path.join(dir, dirname),'');
    });
  });

  test('Try to find directory with all files', function() {
    expect(rsync.getLastBackupDir(dir)).toEqual(null);
  });
});

describe('Files and directories with valid names', function() {
  beforeEach(function() {
    console.log('Defining const file and directory date arrays');
    const fileDates = ['2018-06-15T08:00:00.000Z','2018-06-13T08:00:00.000Z','2018-06-11T08:00:00.000Z','2018-06-09T08:00:00.000Z'];
    const dirDates = ['2018-06-15T07:59:59.000Z','2018-06-13T07:59:59.000Z','2018-06-11T07:59:59.000Z','2018-06-09T07:59:59.000Z'];
    fileDates.forEach(function(filename) {
      fs.writeFileSync(path.join(dir,filename));
    });
    dirDates.forEach(function(dirname) {
      fs.mkdir(path.join(dir,dirname));
    });
  });
  test('File is more recent than directory', function() {
    expect(rsync.getLastBackupDir(dir)).toBe(path.join(dir,'2018-06-15T07:59:59.000Z'));
  });
});

describe('Directories with no valid names', function() {
  beforeEach(function() {
    invalidNames.forEach(function(dirname) {
      fs.mkdir(path.join(dir,dirname));
    });
  });
  test('No valid directory name', function() {
    expect(rsync.getLastBackupDir(dir)).toEqual(null);
  });
});
