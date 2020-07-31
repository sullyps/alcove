# Design Guide

## Alcove Backup System

I've been struggling with exactly what I want to do to maintain some level of consistency among the
codebase for this project and I think perhaps creating a guide to record important design decisions
that are made along the way will be a way to ensure the next time a similar decision is faced, I (or
other maintainers) will make the same decision. 

This guide will record why certain architecture related decisions are made. This can relate to the
organization of the code, the technologies used, or the workflow of the system. This is not a style
guide and should only address deeper architectural decisions.

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
  external monitoring system (ExpressJS webapp). 
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

## Areas for Improvement

As with any project, some areas of this project are poorly designed, or had been created in the
midst of changing requirements and unknown constraints. This section is to serve as a collection of
the areas of the system that are currently functional, but could be done better. Generally
sections noted in this area should prevent the following:

1. Enhanced functionality (the ability to add or improve future features)
2. Improved modularity or extensibility
3. Easier maintenance due to organization or clarity
4. Noticeable performance improvements

By addressing these areas we should be able to acheive at least one of the above goals. We are not
going to try to reduce complexity just to reduce code size, or for minor performance gains, or the 
sake of doing something in a different way. If one of the above goals cannot be achieved, an area
shouldn't be listed in this section.

* Side effects of some methods in `lib/system.js`
  * Several methods of the main system rely on mutating objects, resulting in a confusing flow.
  * Several methods also seem to be responsible for multiple different requirements, violating the
    single responsibility principle and leading to confusing code.
* Inconsistent usage of callbacks, promises, and returns
  * We need to decide on a single best implementation and apply it consistently.
* Documentation of important Memory structures
  * Because we are not using TypeScript we have opened the door for some runtime errors based on
    dynamic types and poorly documented structures. At a minimum, these should have detailed
    descriptions accessible for all developers.
