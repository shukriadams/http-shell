Execute shell commands on remote systems using HTTP. A central coordinator can be used to chain workers togther into a high-availability mesh.

## setup

    npm install -g pkg@4.4.9

## Build 

### Directly

    pkg . --targets node10-linux --output ./build/theapp

or

    pkg . --targets node10-linux-x64 --output ./build/theapp

### CI server build

    cd src
    npm install
    cd build
    npm install
    bash ./build.sh --target windows
