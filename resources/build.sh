#! /bin/bash

dest="dist"

# Go to the project root (assuming
while [[ ! -f app.js ]]; do
  cd ..
  if [[ `pwd` == '/' ]]; then
    echo "Could not find the project root... Cannot create build!" 1>&2
    echo
    exit -1
  fi
done

# Begin the build process
mkdir -p $dest

# 
# Strip all test code references with sed
sed '/^\s*\/\* test-code \*\/\s*$/,/^\s*\/\* end-test-code \*\/\s*$/d' app.js > $dest/app.js
for i in `find app/ lib/ -type f`; do 
  mkdir -p `dirname $dest/$i`
  sed '/^\s*\/\* test-code \*\/\s*$/,/^\s*\/\* end-test-code \*\/\s*$/d' $i > $dest/$i
done

##
# Copy user management script and make executable
cp adminUsers.js $dest/
chmod +x $dest/adminUsers.js

##
# Copy all static assets
cp -r public/ $dest/
cp package.json $dest/

## 
# Done
echo "Done! The build is stored in '$dest'"
echo
