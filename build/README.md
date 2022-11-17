## Building for ARMv7

- Ensure that you have a 32bit version of RasberryPi OS installed, a 64bit version will fail cryptically during builds

- pkg v 4.5.1 is the last version with an easily available node12 build binary for ARMv7.

- Fetch the Node12 build binary

        mkdir -p ~/.pkg-cache/v2.6

        wget https://github.com/yao-pkg/pkg-binaries/releases/download/v1.0.0/fetched-v12.18.1-linux-armv7 -O ~/.pkg-cache/v2.6/fetched-v12.18.1-linux-armv7

- Build

        cd src
        npm install

        cd ..
        cd build
        npm install

        bash build.sh --target armv7 

## Typical Windows CI build Setup

    cd src
    call npm install

    cd ..
    cd build
    call npm install

    sh build.sh --target win64 --upload 1 --owner shukriadams --repo http-shell --token %ACCESS_TOKEN%