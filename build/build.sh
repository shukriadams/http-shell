# based on script from https://gist.github.com/stefanbuck/ce788fee19ab6eb0b4447a85fc99f447

set -e # fail on errors


# capture all arguments passed in, these is anything starting with --  
while [ $# -gt 0 ]; do
    if [[ $1 == *"--"* ]]; then
        param="${1/--/}"
        declare $param="$2"
    fi
    shift
done

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

# force get tags, these don't always seem to be pulled by jenkins
git fetch --all --tags

# get current revision the checkout is on
currentRevision=$(git rev-parse --verify HEAD) 
# get tag on this revision
tag=$(git describe --contains $currentRevision)
# ensure current revision is tagged
if [ -z "$tag" ]; then
    echo "current revision has no tag on it, cannot build";
    exit 1;
fi


GH_REPO="https://api.github.com/repos/$owner/$repo"
GH_TAGS="$GH_REPO/releases/tags/$tag"
AUTH="Authorization: token $token"
WGET_ARGS="--content-disposition --auth-no-challenge --no-cookie"
CURL_ARGS="-LJO#"

# Validate token.
curl -o /dev/null -sH "$token" $GH_REPO || { echo "error - token validation failed";  exit 1; }

# Read asset tags.
response=$(curl -sH "$token" $GH_TAGS)

# Get ID of the asset based on given filename.
eval $(echo "$response" | grep -m 1 "id.:" | grep -w id | tr : = | tr -cd '[[:alnum:]]=')
[ "$id" ] || { echo "Error: Failed to get release id for tag: $tag"; echo "$response" | awk 'length($0)<100' >&2; exit 1; }

if [ $target == "linux" ]; then
    $(npm bin)/pkg --targets node10-linux-x64 --output ./linux64/buildbroker

    filename=NOTSET
    # run app and ensure exit code was 0
    ./linux64/buildbroker --version 
fi

if [ $target == "windows" ]; then
    $(npm bin)/pkg ./../src/. --targets node10-windows-x64 --output ./win64/buildbroker.exe 
    
    filename=./win64/buildbroker.exe
    # run app and ensure exit code was 0
    ./win64/buildbroker --version 
fi

if [ ! $? -eq 0 ]; then
    echo "App build failed : " >&2
    exit 1
fi

# upload file to github
GH_ASSET="https://uploads.github.com/repos/$owner/$repo/releases/$id/assets?name=$(basename $filename)"
curl --data-binary @"$filename" -H "Authorization: token $token" -H "Content-Type: application/octet-stream" $GH_ASSET


echo "App built"
exit 0
