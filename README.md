Execute shell commands on remote systems using HTTP. Calls can be routed to workers by passing them to a coordinator.

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