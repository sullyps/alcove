# Table of Exit Codes

The first thing to check if you receive an exit code termination is the logs.
Likely there will be some error message describing the cause of the
termination and an error stack trace to point you to the place in the code
where the program cannot continue.

Use this table as a quick reference for any exit code that you may receive.

| Exit Code | Fail Event | Debug |
|:---------:|:-------------------------------------:|:-------------------------------------------------------------------------------------------------------------------------------------------------------------:|
| -1 | System.js failed | Will need to check log for exact failure within init(config,db) function |
| -2 | Events database could not be loaded | Check config and data files. Should have an existing directory with proper permissions |
| -3 | Config parsing error | Will need to check log for exact failure within config parsing. Refer to the config .ini example files for correct formatting and required specifications |
| -5 | No machines are  configured to backup | Check the log for unexpected machine configurations,  or runtime failures in machine preparation |
| -6 | Invalid input | Check the console for an error message describing why the input was invalid |
| 2 | SIGINT | Likely a user entered CTRL-C during process |
| 12 | SIGUSR2 | Will only appear if you've defined SIGUSR2 and thrown it somewhere in the codebase. If so, make sure you log the error before throwing the termination signal |
| 15 | SIGTERM | Check the log for the exact process/action that has triggered the SIGTERM to be thrown |
