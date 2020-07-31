# Developer Configuration Examples

Below are example configuration files for new developers. Make sure to read the developer [guide](./developer-guide.md) before using these configuration files. Neither file will work without additional setup.

## System Configuration

This file should be saved at `<project_root>/etc/alcove/alcove.ini`. It assumes that your email address is `your.email@gmail.com`, and your email password is `your_password`.

```text
; Backup System Example Configuration
;
; Use this file as an example to configure the backup system for your
; environment. This file configures the main system and *MUST* be edited
; before startup. Each machine to be backed-up can be configured in an
; individual (.ini) config file in the "machines/" directory. These files
; can be created or modified through the web server after system startup.
;
; NOTE: All file paths must either be absolute or relative
;     : to the application root directory, not relative to this file
;     : location.

; BASIC SETTINGS:

; Network address (or domainname) to bind the web server to, defaulting to 
; 127.0.0.1. Specify 0.0.0.0 to attach to all IPs including external.
;ip='127.0.0.1'

; Port for the web server to run.
;port=3000

; Storage location of the log files.
;log_dir='/var/log/alcove'

; Logging level: ALL < TRACE < DEBUG < INFO < WARN < ERROR < FATAL < MARK | OFF
; (Defaults to ERROR)
log_level='DEBUG'

; Destination for the backup data.
data_dir='data/'

; Allow the web server to initiate sessions even if it is likely that the
; session ID will be sent over plaintext (not configured with HTTPS enabled, 
; and no forward proxy detected that is using HTTPS). It might be required
; to enable this if you have a broken forward proxy that is unable to set
; the "X-Forwarded-Proto" header.
;
; ** Use with caution **
; This setting enables the system to operate in a manner that could allow
; for trivial session hijacking to occur...
;allow_insecure=false

; HTTPS CONFIG
; Location of the ssl key / cert. If specified, the webserver will only run in
; HTTPS mode.
[secure]
key='./etc/alcove/ssl/ssl.key'
cert='./etc/alcove/ssl/ssl.crt'

; RSYNC VARIABLES
[rsync]
; Maximum amount of backups allowed to run at the same time
;max_simultaneous = 6

; ssh key location to use as the identity to connect to the remote machines.
;identity = '/etc/alcove/private.key'

; User to connect to the remote machines. Defaults to root.
;user = 'root'


; RSYNC RETRY VARIABLES
[rsync.retry]
; The program will retry the backup attempt if rsync fails to run successfully
; for any reason. The following variables control that retry process. The first
; retry attempt will occur as specified, but subsequent attempts will be
; delayed by increasing amounts.

; Maximum attempts made to backup a machine when an error occurs. After the
; retry attempts are exhausted, the system will not attempt another backup of
; this machine until the next scheduled backup time.
;max_attempts=4

; Time (in minutes) to wait for the first retry attempt ater rsync completes
;   unsucessfully for a particular machine. Can be fractional (eg. 3.75).
;time = 3

; Multiplier on time to increase duration between backup attempts if failures
; occur. Can be fractional and should be greater than one. The time in
; between backup attempts can be calculated as
; (rsync.retry.time * multiplier ^ (attempt number)). The maximum wait
; period will be (rsync.time * multiplier ^(max_attmpts)).
;multiplier = 2.718

; NOTIFICATIONS VARIABLES
[notifications]
; Schedule for summary report emails to be sent out. Defaults to 8:00am on
; Mondays. Use comma separated schedules if you wish more than one.
; Ex] 1,3,5;[13:30] = Mon, Wed, Fri at 1:30pm
summary_schedule='0,1,2,3,4,5,6;[17:01]'

; The tag to prepend to email subject lines, for filtering purposes. This is
; disabled if not specified or empty. Default is empty.
;tag=''

; Emails to be notified if there is an error in the backup process.
; Specify one address per line, but repeat this option as many times as needed.
email_to[]='your.email@gmail.com'
;email_to[]='user2@bioneos.com'

; The email address that the email is sent from if there is an error.
email_from='your.email@gmail.com'

;
; SMTP CONFIG
; If this section is skipped, the emails will attempt to send directly using
; the local sendmail executable for the machine
; Note that gmail accounts configured for sending emails must authorize less
; secure apps as described at https://support.google.com/a/answer/6260879
[notifications.smtp]
; Hostname for the smtp server through which the emails are sent.
host='smtp.gmail.com'

; Port on which the email server listens.
port=587

; Authentication username for the outgoing emails.
user='your.email@gmail.com'

; Authentication password for the outgoing emails.
pass='your_password'

; SMS
; If SMS is configured, expect to get around 4-5 messages per month given the
; backup system is working. The free tier for AWS is 100 messages per month.
; If sending more messages, consider paying for SNS services.
[notifications.sms]

; Provide a phone number in E.164 format - a maximum of 15 digits prefixed with
;   a country code. Do not prefix with a '+'.
;   For example, a US phone number may look like "+13195550000".
;   See (https://docs.aws.amazon.com/sns/latest/dg/sms_publish-to-phone.html)
;   for more details.
; OR Provide the AWS Topic ARN with subscribers who will receive messages.
;
; Do not provide both values.
;sms_to="+13195550000"
;sms_to="arn:aws:sns:region:subscriber:topicname"

; The AWS access key for your account
;access_key=012345678999

; The AWS secret key for your account
;secret_key=123456EXAMPLE

; The region that supports SMS from AWS
;aws_region='us-east-1'

; Slack
; If this section is specified, notifications will be sent to the following
; Slack WebHook as described by slack.com/apps/A0F7XDUAZ-incoming-webhooks
; Leave blank to disable Slack notifications
[notifications.slack]
; Slack Incoming WebHook URL
;webhook=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX

; The frequency at which notifications should be sent to Slack
; Valid settings are 'summary' (default) and 'all'
; 'summary' sends the same notifications as email and SMS
; 'all' sends notifications of all backup processes
;level=all
```

## Machine Configuration

This file should be saved at `<project_root>/etc/alcove/machines/machine.ini`.

```text
; Name that you wish to call your machine
; Ex]
;   name=machine
;
name=alpha

; Your machine hostname (can be domain name or IP address)
; Ex]
;   host=machine.company.com
;
host=localhost

; The port of the SSH server on the machine
; Must be equal to 22 or between 1024 and 65535 (inclusive)
; Defaults to 22 when blank
;port = 12345

; Your list of backup directories.
; Specify all directories you want included in the list of backed up
; directories, using multiple lines and the [] syntax.
; + Only specify directories, not individual files.
; + All listed directories need to be absolute paths.
; + There should be no double or triple wildcards (** or ***).
;
; If not specified, defaults are /home and /etc.
;
backup_directories[] = /backup-test
;backup_directories[] = /etc

; File extensions to always ignore.
; + Do not include paths or wildcards in these settings.
; + Use caution to ensure these extensions do not match a directory name, as
;   the entire directory will be skipped. Unless this is the desired behavior...
; If a directory is named 'exDir.ext' and '.ext' is excluded, the directory
;   'exDir.ext' will not be included in the backup.
; Ex] Do not backup .swp files
;   ignore_extensions[] = .swp
;
ignore_extensions[] = .testignored

; Specific files or directories to ignore.
; + These should always be absolute paths
; + There should be no double or triple wildcards (** or ***).
; Ex] Do not backup .cache from the "user1" home account
;   ignore_files[] = /home/user1/.cache
;
ignore_files[] = /backup-test/ignored
ignore_files[] = /backup-test/ignore-me.txt

; Describe the backup schedule and time
;   schedule = "DAYS(N);[HH:MM]"
; SCHEDULE
;   DAYS
;     A comma separated list of values representing the days of the week on which
;     to perform a backup (valid values are 0-6). Ranges are also allowed e.g. 1-5
;     is Monday through Friday
;   N
;     The number of backups to keep
;   + Any number of schedules can be defined, separated by a single pipe (|)
;     Ex] DAYS1(7)|DAYS2(4)|...
;
; TIME
;   HH:MM
;     The time to initiate the backup (if possible). Seconds cannot be specified.
;
; The SCHEDULE and TIME must be separated by a single semi-colon (;)
; The entire string must be surrounded with quotes ("")
; Ex] Backup every day at 3AM, keep 7 copies
;   schedule="0,1,2,3,4,5,6(7);[03:00]"
; Ex] Backup every Monday at 1AM, keep 4 copies
;   schedule="1(4);[01:00]"
;
schedule="0,1,2,3,4,5,6(7)|1(4);[17:00]"
```