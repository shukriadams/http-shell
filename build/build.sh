# Example : 
#
#    bash ./build.sh --target linux64
#
# borrows generously from https://gist.github.com/stefanbuck/ce788fee19ab6eb0b4447a85fc99f447
# Note : on linux systems this script must be called with bash, it will not work with sh 

set -e # fail on errors

# capture all arguments passed in (anything starting with --)
while [ $# -gt 0 ]; do
    if [[ $1 == *"--"* ]]; then
        param="${1/--/}"
        declare $param="$2"
    fi
    shift
done

if [ "$target" = "" ]; then
    echo "ERROR : --target not set"
    exit 1;
fi

owner=shukriadams
repo=http-shell

# force get tags, these don't always seem to be pulled by jenkins, use -f to force clobber local tags if out of sync
git fetch --all --tags -f

# get tag on this revision
tag=$(git describe --abbrev=0 --tags)

# ensure current revision is tagged
if [ -z "$tag" ]; then
    echo "ERROR : current revision has no tag on it, cannot upload";
    exit 1;
fi

# write version to build
node writeVersion --version $tag --path ./../src/package.json

# Call the node package pkg directly, on build servers it is not installed globally, mainly because on Windows Jenkins agents
# global npm packages are a pain to set up, and we want to minimize changing the global state of agents.
if [ "$target" = "linux64" ]; then
    filename=./linux64/http-shell
    name="http-shell_linux64"

    rm -rf $filename
    $(npm bin)/pkg ./../src/. --targets node12-linux-x64 --output $filename

    # run app and ensure exit code was 0
    (${filename} --version )
elif [ "$target" = "win64" ]; then
    filename=./win64/http-shell.exe
    name="http-shell_win64.exe"

    rm -rf $filename
    $(npm bin)/pkg ./../src/. --targets node12-windows-x64 --output $filename
    
    # run app and ensure exit code was 0
    ($filename --version)
elif [ $target = "armv7" ]; then
    filename=./arm7/http-shell
    name="http-shell_arm7"

    rm -rf $filename
    $(npm bin)/pkg ./../src/. --targets node12-linux-armv7 --output $filename
    
    # run app and ensure exit code was 0
    (${filename} --version )
else
    echo "ERROR : ${target} is not a valid --target, allowed values are [linux64|win64|armv7]"
    exit 1;
fi

# confirm last command returned error code 0
if [ ! $? -eq 0 ]; then
    echo "ERROR : App test failed " >&2
    exit 1
fi

echo "App built"

if [ ! "$upload" = 1 ]; then
    exit 0
fi

# ensure required arguments
if [ -z "$owner" ]; then
    echo "--owner : github repo owner is required";
    exit 1;
fi

if [ -z "$repo" ]; then
    echo "--repo : github repo is required";
    exit 1;
fi

if [ -z "$token" ]; then
    echo "--token : github api token is required";
    exit 1;
fi



GH_REPO="https://api.github.com/repos/$owner/$repo"
GH_TAGS="$GH_REPO/releases/tags/$tag"
AUTH="Authorization: token $token"
WGET_ARGS="--content-disposition --auth-no-challenge --no-cookie"
CURL_ARGS="-LJO#"

# Validate token.
curl -o /dev/null -sH "$token" $GH_REPO || { echo "Error : token validation failed";  exit 1; }

# Read asset tags.
response=$(curl -sH "$token" $GH_TAGS)

# Get ID of the asset based on given filename.
eval $(echo "$response" | grep -m 1 "id.:" | grep -w id | tr : = | tr -cd '[[:alnum:]]=')
[ "$id" ] || { echo "Error : Failed to get release id for tag: $tag"; echo "$response" | awk 'length($0)<100' >&2; exit 1; }

# upload file to github
GH_ASSET="https://uploads.github.com/repos/$owner/$repo/releases/$id/assets?name=$(basename $name)"
curl --data-binary @"$filename" -H "Authorization: token $token" -H "Content-Type: application/octet-stream" $GH_ASSET

echo "App uploaded"
