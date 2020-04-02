# build 
pkg ./../src/. --targets node10-linux-x64 --output ./build/buildbroker &&

# run app and ensure exit code was 0
./build/buildbroker --version &&
if [ $? -eq 0 ]
then
  echo "App built"
  exit 0
else
  echo "App build failed : " >&2
  exit 1
fi