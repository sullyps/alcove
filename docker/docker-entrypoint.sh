#!/usr/bin/env sh


##
# On first run of the container, setup the environment
if [ ! -s /opt/alcove/node_modules ]; then
  ##
  # Generate all project required links 
  #
  # config related
  ln -s /src/etc/alcove/alcove.ini etc/alcove/
  ln -s /src/etc/alcove/machines/ etc/alcove/
  # main app
  ln -s /src/app/ /opt/alcove/
  ln -s /src/lib/ /opt/alcove/
  ln -s /src/data/ /opt/alcove/
  ln -s /src/sass/ /opt/alcove/
  ln -s /src/public/ /opt/alcove/
  ln -s /src/resources/ /opt/alcove/
  ln -s /src/app.js /opt/alcove/
  ln -s /src/adminUsers.js /opt/alcove/
  ln -s /src/package.json /opt/alcove/
  ln -s /src/package-lock.json /opt/alcove/

  ##
  # Finally, copy in the gulpfile because gulp won't operate on symlinks
  cp /src/gulpfile.js .

  ##
  # Install / compile modules
  npm install
fi
  
##
# Ensure permissions work
echo "Ensuring 'data', 'logs', and 'public/style.css' are writeable..."
sudo chmod 777 /src/data
sudo chmod 777 /src/logs
sudo chmod 777 /src/public/css/style.css

##
# Check for differences in gulpfile.js and /src/gulpfile.js and warn developer
# TODO: add this

# TODO: check for config, and override 
#   [secure] section to ensure we always use the self-signed certs from the container
#   and the data_dir / logs settings to write to the expected bind-mount locations

# Startup server
npm start

