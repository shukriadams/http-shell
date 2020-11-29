Execute shell commands on remote systems using HTTP. A central coordinator can be used to chain workers togther into a high-availability mesh.

## Requirements

http-shell relies on `sh` as a standard shell on all worker systems. On Linux this will usually be available already, on Windows you'll need to install it, and add it your system path so it's available from the command line. By far the easiest way to get sh on Windows is to install [Git for windows](https://git-scm.com), and ensure that `<git-install-path>/bin` and `<git-install-path>/usr/bin` are added to your system `PATH` environment variable.

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
