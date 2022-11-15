## Typical CI build Setup

    cd src
    call npm install

    cd ..
    cd build
    call npm install

    sh build.sh --target win64 --upload 1 --owner shukriadams --repo http-shell --token %ACCESS_TOKEN%