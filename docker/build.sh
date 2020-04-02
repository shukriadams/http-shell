# copy static package references to assets folder
cp ./node_modules/diskusage/build/Release/diskusage.node ./build &&

# build 
pkg . --targets node10-linux-x64 --output ./build/theapp &&

# run app and ensure exit code was 0
./build/theapp &&
if [ $? -eq 0 ]
then
  echo "App built"
  exit 0
else
  echo "App build failed : " >&2
  exit 1
fi