Execute shell commands on remote systems using HTTP. A central coordinator can be used to chain workers togther into a high-availability mesh. http-shell is heavily inspired by Jenkin's agent system, and tries to achieve a similar result, in the simplest possible way possible.

## Download

Windows and Linux executable are available from this repo's [release](https://github.com/shukriadams/http-shell/releases) page. MacOS is not supported, but feel free to build yourself.

## Requirements

http-shell relies on `sh` as a standard shell on all worker systems. On Linux this will usually be available already, on Windows you'll need to install it, and add it your system path so it's available from the command line. By far the easiest way to get sh on Windows is to install [Git for windows](https://git-scm.com), and ensure that `<git-install-path>/bin` and `<git-install-path>/usr/bin` are added to your system `PATH` environment variable.

## Use

### Direct 

Start a worker with

    http-shell --mode worker

Do something on that worker from another device 

    http-shell --mode client --worker <worker-ip> --command "ls ."

### Coordinator

Use a mesh of workers to do things by routing your commands via a central coordinator. In this setup, the client doesn't need to know which worker will service a command.

Start a coordinator

    http-shell --mode coordinator 

Start a worker

    http-shell --mode worker --cordinator <coordinator-ip>

Do something on a worker 

    http-shell --mode client --coordinator <coordinator-ip> --command "ls ."

### Tagging

Workers can be tagged with a comma-separated list of strings to limit where commands will be serviced. 

    http-shell --mode worker --cordinator <coordinator-ip> --tags "win,testing"

Do something on a specific worker

    http-shell --mode client --coordinator <coordinator-ip> --tags win --command "ls ." 

## Build 

### Directly

    npm install -g pkg@4.4.9

    pkg . --targets node10-linux --output ./build/theapp

or

    pkg . --targets node10-linux-x64 --output ./build/theapp

### CI server build

Setup requirements

    cd src
    npm install
    cd build
    npm install

Build for Windows

    bash ./build.sh --target win64

Build for Linux

    bash ./build.sh --target linux64
