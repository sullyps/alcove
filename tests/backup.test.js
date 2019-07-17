const system = require('../lib/system.js');
const rsync = require('../lib/rsync.js');
const models = require('../app/models');
const fs = require('fs-extra');
const path = require('path');

// This will always be a relative path to the tests directory, where
// these tests are located.
const dir = path.join(__dirname, 'tmp', 'backup-dirs');
const machine1 = {
  schedule: '0,2-6(6)|1(4);[23:59]',
  name: 'docker-container',
  host: 'localhost',
  backupDirectories: [ '/home', '/home/node/***', '/backup_test/***' ],
  ignoreExtensions: [],
  ignoreFiles: [],
  lastBackup: {},
  failures: []
};
const machine2 = {
  schedule: '0,2-6(6)|1(4);[23:59]',
  name: 'docker-container',
  host: 'localhost',
  backupDirectories: [ '/home', '/home/node/***', '/backup_test/***' ],
  ignoreExtensions: [],
  ignoreFiles: [],
  lastBackup: {},
  failures: []
};
const rsyncStats1 = {
  deletedFilesCount: 0,
  transferredFilesCount: 0,
  totalFileSize: 4410,
  totalTransferredFileSize: 0,
  totalBytesSent: 102,
  totalBytesReceived: 1055,
  startTime: '2019-07-16T20:38:00.006Z',
  totalTransferTime: 0.284,
  stdout: '\nNumber of files: 50 (reg: 34, dir: 16)\nNumber of created files: 0\nNumber of deleted files: 0\nNumber of regular files transferred: 0\nTotal file size: 4,410 bytes\nTotal transferred file size: 0 bytes\nLiteral data: 0 bytes\nMatched data: 0 bytes\nFile list size: 1,022\nFile list generation time: 0.001 seconds\nFile list transfer time: 0.000 seconds\nTotal bytes sent: 102\nTotal bytes received: 1,055sent 102 bytes  received 1,055 bytes  2,314.00 bytes/sec\ntotal size is 4,410  speedup is 3.81\n',
  stderr: '',
  code: 0
};
const rsyncStats2 = {
  startTime: new Date('2019-07-16T20:55:00.015Z'),
  totalTransferTime: 0.044,
  stdout: '',
  stderr: 'ssh: connect to host localhost port 22: Cannot assign requested address\r\nrsync: connection unexpectedly closed (0 bytes received so far) [Receiver]\nrsync error: unexplained error (code 255) at io.c(226) [Receiver=3.1.1]\n',
  code: 255,
  error: 'ssh: connect to host localhost port 22: Cannot assign requested address\r\nrsync: connection unexpectedly closed (0 bytes received so far) [Receiver]\nrsync error: unexplained error (code 255) at io.c(226) [Receiver=3.1.1]\n'
};
const validDirectoryNames = ['2018-06-15T18:49:00.010Z', '2018-06-15T18:49:00.000Z',
    '2018-06-14T18:49:00.010Z', '2018-06-13T18:49:00.010Z'];
const invalidNames = ['incorrect-dir-name', '2018-06-15', '2018-06-15T18:49:00:000',
  '2018-13-15T18:49:00:000Z', '2018-12-60T18:49:00:000Z', '201-12-15T18:49:00:000Z',
  '2018-12-15T60:49:00:000Z', '2018-12-15T18:60:00:000Z'];

let config;
let db;

beforeAll(done => {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'test.config.json')));
  fs.emptyDirSync(config.data_dir);

  models.init(config)
  .then(database => {
    db = database;
    system.init(config, db);
  })
  .then(done);
});

// Before each test, remove old test file directory if it exists
// and create a new directory.
beforeEach(() => {
  fs.emptyDirSync(dir);
});

// Always remove the directory with the simulated data after each test
afterEach(() => {
  fs.removeSync(dir);
});

describe('Database operations work', () => {
  test('Add BackupEvent', done => {
    system.__insertBackupEvent(machine1, rsyncStats1)
    .then(() => {
      return db.BackupEvent.findAll({
        where: {
          machine: machine1.name,
          rsyncExitCode: rsyncStats1.code,
          transferSize: rsyncStats1.totalTransferredFileSize || 0,
          transferTimeSec: rsyncStats1.totalTransferTime || 0
        }
      });
    })
    .then(backupEvents => {
      expect(backupEvents.length).toBe(1);
    })
    .then(done)
    .catch(done.fail);
  });
});

describe('Only valid directories inside backup directory', () => {
  beforeEach(() => {
    validDirectoryNames.forEach(dirname => {
      fs.mkdirSync(path.join(dir, dirname));
    });
  });

  test('Get the most recent backup directory', () => {
    expect(rsync.getLastBackupDir(dir)).toBe(path.join('..', '2018-06-15T18:49:00.010Z'));
  });
});

describe('Valid file names but no directories', () => {
  beforeEach(() => {
    validDirectoryNames.forEach(dirname => {
      fs.writeFileSync(path.join(dir, dirname), '');
    });
  });

  test('Try to find directory with all files', () => {
    expect(rsync.getLastBackupDir(dir)).toEqual(null);
  });
});

describe('Files and directories with valid names', () => {
  beforeEach(() => {
    const fileDates = ['2018-06-15T08:00:00.000Z', '2018-06-13T08:00:00.000Z', '2018-06-11T08:00:00.000Z', '2018-06-09T08:00:00.000Z'];
    const dirDates = ['2018-06-15T07:59:59.000Z', '2018-06-13T07:59:59.000Z', '2018-06-11T07:59:59.000Z', '2018-06-09T07:59:59.000Z'];
    fileDates.forEach(filename => {
      fs.writeFileSync(path.join(dir, filename), '');
    });
    dirDates.forEach(dirname => {
      fs.mkdirSync(path.join(dir, dirname));
    });
  });
  test('File is more recent than directory', () => {
    expect(rsync.getLastBackupDir(dir)).toBe(path.join('..', '2018-06-15T07:59:59.000Z'));
  });
});

describe('Directories with no valid names', () => {
  beforeEach(() => {
    invalidNames.forEach((dirname) =>  {
      fs.mkdirSync(path.join(dir, dirname));
    });
  });
  test('No valid directory name', () => {
    expect(rsync.getLastBackupDir(dir)).toEqual(null);
  });
});
