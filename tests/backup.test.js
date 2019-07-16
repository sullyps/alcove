const rsync = require('../lib/rsync.js');
const models = require('../app/models');
const fs = require('fs-extra');
const path = require('path');

// This will always be a relative path to the tests directory, where
// these tests are located.
const dir = path.join(__dirname, 'tmp', 'backup-dirs');
const validDirectoryNames = ['2018-06-15T18:49:00.010Z','2018-06-15T18:49:00.000Z',
    '2018-06-14T18:49:00.010Z','2018-06-13T18:49:00.010Z'];
const invalidNames = ['incorrect-dir-name','2018-06-15','2018-06-15T18:49:00:000',
  '2018-13-15T18:49:00:000Z','2018-12-60T18:49:00:000Z','201-12-15T18:49:00:000Z',
  '2018-12-15T60:49:00:000Z','2018-12-15T18:60:00:000Z'];

let db;

beforeAll(done => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'test.config.json')));
  models.init(config)
  .then(database => {
    db = database;
  })
  .then(done);
});

// Before each test, remove old test file directory if it exists
// and create a new directory.
beforeEach(() => {
  if (fs.existsSync(dir))
    fs.removeSync(dir);
  fs.mkdirSync(dir);
});

// Always remove the directory with the simulated data after each test
afterEach(() => {
  if (fs.existsSync(dir))
    fs.removeSync(dir);
});

describe('Only valid directories inside backup directory', () => {
  beforeEach(() => {
    validDirectoryNames.forEach((dirname) => {
      fs.mkdirSync(path.join(dir, dirname));
    });
  });

  test('Get the most recent backup directory', () => {
    expect(rsync.getLastBackupDir(dir)).toBe(path.join('..','2018-06-15T18:49:00.010Z'));
  });
});

describe('Valid file names but no directories', () => {
  beforeEach(() => {
    validDirectoryNames.forEach((dirname) => {
      fs.writeFileSync(path.join(dir, dirname),'');
    });
  });

  test('Try to find directory with all files', () => {
    expect(rsync.getLastBackupDir(dir)).toEqual(null);
  });
});

describe('Files and directories with valid names', () => {
  beforeEach(() => {
    const fileDates = ['2018-06-15T08:00:00.000Z','2018-06-13T08:00:00.000Z','2018-06-11T08:00:00.000Z','2018-06-09T08:00:00.000Z'];
    const dirDates = ['2018-06-15T07:59:59.000Z','2018-06-13T07:59:59.000Z','2018-06-11T07:59:59.000Z','2018-06-09T07:59:59.000Z'];
    fileDates.forEach((filename) => {
      fs.writeFileSync(path.join(dir,filename));
    });
    dirDates.forEach((dirname) => {
      fs.mkdirSync(path.join(dir,dirname));
    });
  });
  test('File is more recent than directory', () => {
    expect(rsync.getLastBackupDir(dir)).toBe(path.join('..','2018-06-15T07:59:59.000Z'));
  });
});

describe('Directories with no valid names', () => {
  beforeEach(() => {
    invalidNames.forEach((dirname) =>  {
      fs.mkdirSync(path.join(dir,dirname));
    });
  });
  test('No valid directory name', () => {
    expect(rsync.getLastBackupDir(dir)).toEqual(null);
  });
});
