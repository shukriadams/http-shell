set -e # fail on errors

  
TARGET=linux
while getopts t: option
do
case "${option}"
in
    t) TARGET=${OPTARG};;
esac
done

if [ $TARGET == "linux" ]; then
    pkg ./../src/. --targets node10-linux-x64 --output ./linux64/buildbroker
        # run app and ensure exit code was 0
    ./linux64/buildbroker --version 
fi

if [ $TARGET == "windows" ]; then
    pkg ./../src/. --targets node10-windows-x64 --output ./win64/buildbroker.exe 
    # run app and ensure exit code was 0
    ./win64/buildbroker --version 
fi

if [ $? -eq 0 ]
then
  echo "App built"
  exit 0
else
  echo "App build failed : " >&2
  exit 1
fi