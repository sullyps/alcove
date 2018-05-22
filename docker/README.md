# Dockerized execution

We are in the process of migrating to docker as both development execution
and might consider this for production as well. However, this is a new decision
and thus, our thinking on the environment setup will be in a state of flux
until we finalize our plans.

## Requirements

There are several components that will require appropriate handling to allow
this containerized execution to work. I will try to outline the steps needed
for this execution here:

1. Permissions
2. Bind mounts
3. Port forward

### Permissions

Both the `data` and `logs` directories will need to be written to by the
`node` user (UID 1000) from the container. Unless UID 1000 happens to map
to your user id, you need to execute the following:

``` 
$ chmod o+w -R data && chmod o+w -R logs
```

### Bind Mounts

The source code is intended to be mounted in `/opt/backup` on the container.
New (>=17.06) versions of docker allow you to use the `--mount` syntax:

```
--mount type=bind,source="$(pwd)"/,target=/opt/backup
```

### Port forward

In order to access the web application portion of the system, you will have
to forward the container's port 3000 to some public port

```
-p <public_port>:3000
```

## Docker Image

We have created a `Dockerfile` that should create the image as appropriate,
and suggest it is named `bioneos/backup`.

```
 $ cd docker
 $ docker build -t bioneos/backup .
```

## Example execution commands

```
$ cd <project workdir>
$ cd docker; docker build -t bioneos/backup .; cd ..
$ chmod o+w -R ./data && chmod o+w -R ./logs
$ docker run -p 3333:3000 --mount type=bind,source="$(pwd)"/,target=/opt/backup -ti bioneos/backup 
```

You could also run in detached mode (`-d`) if you don't want to monitor the
gulp output.

## Developer Conveniences

By default the app assumes the development environment and will execute `gulp`
as a convenience and allowing for both app reload and browser livereload.
For livereload to work, you will have to forward the `livereload` port to
a public port that matches the containers port number.

