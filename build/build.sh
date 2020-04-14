# build 
pkg ./../src/. --targets node10-linux-x64 --output ./linux64/buildbroker &&
pkg ./../src/. --targets node10-windows-x64 --output ./win64/buildbroker.exe &&
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