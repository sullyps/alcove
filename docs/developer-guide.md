# Developer Guide

The goal of this guide is to help developers:

1. Learn how to set up a development environment
2. Explore the structure and control flow of Alcove

## Setting Up A Development Environment

This section will explain step-by-step how to set up a development environment for Alcove.

### About Docker

Alcove uses Docker to ensure that each developer's environment is the same. Docker does this using images and containers. Containers are kind of like virtual machines in that they contain an operating system, dependencies, and project configurations. However, they have several advantages that are tangential to this guide. For more information, read this [article](https://www.docker.com/resources/what-container). Images are a way to distribute containers by creating a blueprint for what operating system to use, what dependencies to install, and what shell commands to run. If you come from an object-oriented background, you can think of images as classes and containers as instances of a class.

### Using Docker

You can download Docker here:

- [Linux](https://hub.docker.com/search?q=&type=edition&offering=community&operating_system=linux)
- [MacOS](https://download.docker.com/mac/stable/Docker.dmg)
- [Windows](https://download.docker.com/win/stable/Docker%20Desktop%20Installer.exe)

Once Docker is running, from the project root, run the following command to create an image of Alcove called `alcove`:

```shell script
docker build -t alcove docker/
```

This command might take a while depending on your internet speed since it has to download lots of dependencies. After it finishes, you can create a container using the following command:

```shell script
docker container run -it -p 3000:3000 -v "$(pwd):/opt/alcove" -u root --name alcove alcove bash
```

This command creates a container called `alcove` from the image `alcove`. It forwards connections from port 3000 on your computer to port 3000 in the container. It also creates a bind mount between the current working directory on your computer (which should be the project root) and `/opt/alcove` in the container. This means that project files changed on your computer get changed in the container and vice versa. Finally, the command enters a bash shell inside the container as the `root` user.

Once the command finishes, you should see a shell starting with `root@d6d42b77be85:/opt/alcove#` where `d6d42b77be85` is the container ID.

From here on out, all commands should be executed inside the container shell. The only exception is when working with `git`: all `git` commands should be executed in your computer's shell. It is easiest to open two terminal tabs for this reason.

At any point, you can exit the container shell by using the following command:

```shell script
exit
```

Once you have exited the shell, you can stop the container using this command:

```shell script
docker container stop alcove
```

Stopping the container saves your computer's resources when you're not working on the project. To start the container again, run:

```shell script
docker container start alcove
```

Then, you can reenter the container shell using this command:

```shell script
docker exec -it -u root alcove bash
```

For a thorough reference of all the available Docker commands, see the official [documentation](https://docs.docker.com/reference). Some important commands include:

| Command | Result |
|:--------|:-------|
| `docker container ls -a` | Lists all containers |
| `docker ps -a` | Lists all containers (but shorter) |
| `docker container rm alcove` | Deletes the `alcove` container |
| `docker image ls -a` | Lists all images |
| `docker image rm alcove` | Deletes the `alcove` image |

### Installing Dependencies

Inside the Docker container, you can install/update Node modules with the following command:

```shell script
npm i
```

Then, you should install `openssh-server`. This allows you to make SSH connections so that the main backup process can function. To do this, run the following command:

```shell script
apt-get install openssh-server -y
```

Finally, you should install the `sqlite3` command line interface. This allows you to access the Alcove database, which uses SQLite 3. You can install `sqlite3` with this command:

```shell script
apt-get install sqlite3
```

### Configuration Files

To run Alcove, you must create a system configuration and any number of machine configurations. The system configuration controls general behavior such as where to send email notifications, and each machine configuration specifies how to back up that machine.

To create a system configuration, create a file in `<project_root>/etc/alcove` called `alcove.ini` with the contents of `<project_root>/config/alcove.ini.example`. Then, go through the file and uncomment/set the following settings:

| Option Name | Option Value | Explanation |
|:------------|:-------------|:------------|
| `log_level` | `'DEBUG'` | Shows all log messages with severity of `DEBUG` or greater |
| `data_dir` | `'data/'` | Saves backups in `<project_root>/data` |
| `secure.key` | `'./etc/alcove/ssl/ssl.key'` | Uses `ssl.key` for HTTPS |
| `secure.cert` | `'./etc/alcove/ssl/ssl.crt'` | Uses `ssl.crt` for HTTPS |
| `summary_schedule` | `'0,1,2,3,4,5,6;[17:01]'` | Sends summary emails at 17:01 UTC every day of the week |
| `email_to[]` | `'your.email@gmail.com'` | Where to send summary emails; this should probably be a spam email |
| `email_from` | `'your.email@gmail.com'` | Where to send summary emails from; this can be the same as `email_to[]`; if you are using a Gmail account, you must allow access from "less secure apps" as per [this article](https://support.google.com/accounts/answer/6010255) |
| `notifications.smtp.host` | `'smtp.gmail.com'` | The host of the SMTP server; `smtp.gmail.com` if `email_from` is a Gmail account |
| `notifications.smtp.port` | `587` | The port of the SMTP server; `587` if `email_from` is a Gmail account |
| `notifications.smtp.user` | `'your.email@gmail.com'` | The same email as `email_from` |
| `notifications.smtp.pass` | `'your_password'` | The password to `email_from` |

[Here](./developer-config-examples.md#system-configuration) is the full system configuration file if you want to copy and paste it.

Creating a machine configuration file is much simpler. Simply create a file in `<project_root>/etc/alcove/machines` called `machine.ini` with the contents of `<project_root>/config/machines/machine.ini.example`. Then, go through the file and uncomment/set the following settings:

| Option Name | Option Value | Explanation |
|:------------|:-------------|:------------|
| `name` | `alpha` | Sets the machine name to `alpha` (this can be whatever you want) |
| `host` | `localhost` | Backs up the Docker container itself |
| `backup_directories[]` | `/backup-test` | Backs up the contents of `/backup-test` |
| `ignore_extensions[]` | `.testignored` | Does not back up files with the extension `.testignored` |
| `ignore_files[]` | `/backup-test/ignored` | Does not back up files in the directory `/backup-test/ignored` |
| `ignore_files[]` | `/backup-test/ignore-me.txt` | Does not back up the file `/backup-test/ignore-me.txt` |
| `schedule` | `"0,1,2,3,4,5,6(7)\|1(4);[17:00]"` | Backs up the machine at 17:00 UTC every day; keeps the last 7 copies of backups from everyday and the last 4 copies of Monday backups |

[Here](./developer-config-examples.md#machine-configuration) is the full machine configuration file if you want to copy and paste it.

### Additional Configuration

To finish up your configuration, you need to create some mock files on which to test backups. If you use the configuration files from above, the following command (from the container shell) will create the necessary files to test if the backup functionality is working:

```shell script
mkdir /backup-test && echo "This file should be ignored because of its extension" > /backup-test/ext-ignore.testignored && echo "This file should be backed up" > /backup-test/essay.txt && echo "This Markdown file should be backed up" > /backup-test/another-file.md && mkdir /backup-test/ignored && echo "This file should be ignored because of the directory in which it is located" > /backup-test/ignored/dir-ignore.txt && echo "This file should be ignored because it is specifically ignored in the machine config" > /backup-test/ignore-me.txt
```

Next, to enable HTTPS on the monitoring interface, you need to generate an SSL certificate. To do this, create an `ssl` folder in the `<project_root>/etc/alcove` directory. Then, run the following two commands (from the container) in that folder:

```shell script
openssl ecparam -out ssl.key -name prime256v1 -genkey
openssl req -x509 -new -key ssl.key -out ssl.crt -days 365 -subj "/C=US/ST=Iowa/L=Coralville/O=Bio::Neos, Inc./CN=localhost"
```

When you're done, you can `cd` back to the project root.

The final step is to generate an SSH key for connecting to machines (in this case, just `localhost`). To generate the key, run the following command and choose the default settings whenever prompted (this means you should accept the default location and not use a password):

```shell script
ssh-keygen -t rsa -b 4096 -C "your.email@gmail.com"
```

Once you've done this, you should be able to run `npm start`. If you get no errors, then you're mostly done with setting up your development environment. You can now stop the system using <kbd>CTRL</kbd>+<kbd>C</kbd>.

To allow SSH connections using your SSH key, run the following command in the container shell:

```shell script
cat ~/.ssh/id_rsa.pub > ~/.ssh/authorized_keys && cat ~/.ssh/id_rsa.pub > ~/.ssh/known_hosts
```

Next, you should turn on your SSH server. You need to do this every time you restart the Docker container. Run the following command:

```shell script
service ssh start
```

If you ever want to restart or stop the SSH server, run the same command as above but replace `start` with `restart` or `stop`.

Now, you can generate a login for the web interface. To do this, run the following command:

```shell script
node adminUsers.js
```

Press `1` to add a user. Then, choose whatever username and password you want. You will use these to log in to the monitoring interface later.

You're finally ready to test everything! Make note of the current time. Then, edit the time in the `machine.ini` schedule to be a few minutes in the future (remember these times are in 24-hour UTC). Change the time in the `alcove.ini` summary schedule to be one minute after that. Now, start Alcove again using `npm start`. (You will repeat this step every time you want to simulate a backup event. Your backup and email schedules specified in `machine.ini` and `alcove.ini` should specify backups and emails every day during development.)

After the time in `machine.ini` has passed, check the logs for any errors, and check `<project_root>/data/backup-test/alpha` for a timestamped backup folder. Inside that folder, check for `essay.txt` and `another-file.md`. If any files besides those two exist or if no files exist, something went wrong.

After the time in `alcove.ini` has passed (one minute later), check your email for an HTML email containing a summary of the system status and each machine.

Next, navigate to `https://localhost:3000`. You will probably get a warning about it being unsafe. Proceed to the page anyway. Use the login credentials you generated earlier. You should see a dashbaord for the entire backup system and one machine listed called `alpha`. If you click on `alpha`, it should show a list of backup attempts (including the recent attempt) and a calendar of successful backup saves.

Finally, you should take a look at the database. Open a new terminal tab and enter the Docker container shell. Then, run:

```shell script
sqlite3 data/events.db
```

This should open a new SQLite shell. If you're unfamiliar with SQLite syntax, you can learn about it [here](https://www.sqlitetutorial.net/).

To see each table in the database, run the following command:

```sqlite
.tables
```

To see the schema of the `BackupEvents` table (or another table by replacing the name), run the following command:

```sqlite
.schema BackupEvents
```

To see all the entries in the `BackupEvents` table (or another table by replacing the name), run the following command:

```sqlite
SELECT * FROM BackupEvents;
```

Finally, you're done setting up the Alcove development environment. You might need to refer back to some of these commands at a later point if you forget.

## A Tour of Alcove

This section will give a brief overview of how Alcove works.

### Control Flow

Execution of the backup system begins in `app.js`. The first thing that Alcove does is parse the system and machine configuration files. It is designed to fail liberally, so the system will refuse to start with a configuration error instead of crashing later on.

After that, Alcove configures logging.

Next, Alcove connects to the database. As mentioned already, the database is an SQLite file stored at `<data_dir>/events.db` (if you followed the guide above, this will be `<project_root>/data/events.db`.

Then, Alcove starts the main process. The core functionality of the backup system is contained in `<project_root>/lib/system.js`. This includes scheduling backups and generating summary emails.

Finally, the monitoring system starts up at `https://localhost:3000`. This allows users to see whether recent backups have succeeded and when backups of each machine are available. The monitoring system is a basic Express app stored in `<project_root>/app` using a MVC architecture.

### The Backup Process

Alcove schedules backups in `<project_root>/lib/system.js` by reading the schedule for each machine configuration. Then, Alcove generates "buckets", which are times when there should be backups. At each time indicated on the schedule, Alcove will check if the most recent bucket is empty. If it is, Alcove will start a backup of that machine. The actual backup process is handled in `<project_root>/lib/rsync.js`. Alcove will also delete any old buckets and their associated backups based on the schedule for that machine.

## Where do I go from here?

Before beginning work on Alcove, you should read the [design guide](design-guide.md). This guide explains much of the thinking behind why Alcove works the way it does.

In addition, you should read this [article](https://nvie.com/posts/a-successful-git-branching-model/) about GitFlow. Alcove uses GitFlow to maintain a simple version history.

You should also take note of two other docs:

- The exit codes [guide](exit-codes.md) explains what each exit code means.
- The SMS [guide](sms-guide.md) explains how to set up SMS notifications (in addition to regular email notifications).

At this point, you are ready to begin development of Alcove. Make sure to check out the outstanding issues [here](https://github.com/bioneos/alcove/issues).
