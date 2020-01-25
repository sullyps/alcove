#!/usr/bin/env sh


##
# On first run of the container, setup the environment
if [ ! -f /opt/alcove/node_modules/ready ]; then
  ##
  # Install / compile modules
  sudo chmod 777 /opt/alcove/node_modules
  npm install

  # Symlink SSL cert for visibility
  ln -s /etc/alcove/ssl/ssl.key node_modules/
  ln -s /etc/alcove/ssl/ssl.crt node_modules/

  # Finish install
  touch node_modules/ready
fi
  
##
# Ensure permissions work
echo "Ensuring 'data', 'logs', and 'public/style.css' are writeable..."
sudo chmod 777 /opt/alcove/data
sudo chmod 777 /opt/alcove/logs
sudo chmod 777 /opt/alcove/public/css/style.css

# TODO: check for config, and override 
#   [secure] section to ensure we always use the self-signed certs from the container
#   and the data_dir / logs settings to write to the expected bind-mount locations

# Startup server
npm start

