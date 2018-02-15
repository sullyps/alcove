# Design Guide
## Bio::Neos Backup System

I've been struggling with exactly what I want to do to maintain some level of consistency among the
codebase for this project and I think perhaps creating a guide to record important design decisions
that are made along the way will be a way to ensure the next time a similar decision is faced, I (or
other maintainers) will make the same decision. 

This guide will record why certain architecture related decisions are made. This can relate to the
organization of the code, the technologies used, or the workflow of the system. This is not a style
guide and should only address deeper problems.

This guide should be opinionated but malleable. Even if a decision is made a particular way for a
particular reason at a time in the past, as development continues we may find a new reason that
trumps the previous reasons for a design. At that time, I intend both the guide and the code base to
require an update -- and that process should occur as atomically and thoroughly as possible. Ideally
we will make the decision to change a significant design and have a single pass through the code
that addresses that design everywhere without adding any features or correcting any bugs (except for
side effects to the design change).

I intend for this guide to be a living document, and reviewed on a periodic basis. 

### Core Principles

* This system is intended to be used by expert system administrators. While intuitive, it should not
  reduce functionality for the sake of simple and easy use.
* This system has two tightly integrated components: The backup system (NodeJS process) and its
  external reporting system (ExpressJS webapp). 
* To minimize runtime issues, all configuration most be explicitly checked for sanity before the
  process is allowed to startup.
* All important information should be written to a well organized set of log files. Even in the
  absence of access to the web interface, a SysAdmin should be able to recognize, diagnose, and
  correct problems through a review of the log files.
* If a runtime issue is detected during startup, the process should abort immediately.
* If a runtime issue is detected after startup, the system should attempt to notify the configured
  sources immediately. 
* In the absence of runtime issues, the system should report its good health to the configured
  notification sources on a periodic basis.
* The backup system is configured through files in the file system and after process startup, the
  configuration will not change unless the system is restarted after the files are changed.
* The external reporting system is a "view-only" system. No configuration changes can be made
  through this interface for security reasons. 
  * We are open to a "restore" feature through this interface, however.
  * We potentially will allow a "generate config file" feature that would generate a new config, but
    would not be able to restart the system (you would need root access to the system ideally).
