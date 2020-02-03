#!/usr/bin/env sh
cd /opt/alcove

##
# On first run of the container, setup the environment
if [ ! -f node_modules/ready ]; then
  ##
  # Install / compile modules
  sudo chmod 777 node_modules
  npm install

  # Finish install
  touch node_modules/ready
fi
  
##
# Ensure permissions work
echo "Ensuring 'data', 'logs', 'etc', and 'public/style.css' are writeable..."
sudo chmod 777 /opt/alcove/data
sudo chmod 777 /opt/alcove/logs
sudo chmod 777 /opt/alcove/etc
sudo chmod 777 /opt/alcove/public/css/style.css

# Check for [secure], and override 
#   [secure] section to ensure we always use the self-signed certs from the
#   container and the data_dir / logs settings to write to the expected 
#   bind-mount locations
key_present=$(grep -c "^\s*key\s*=" config/alcove.ini)
cert_present=$(grep -c "^\s*cert\s*=" config/alcove.ini)
data_dir_present=$(grep -c "^\s*data_dir\s*=" config/alcove.ini)
log_dir_present=$(grep -c "^\s*log_dir\s*=" config/alcove.ini)

if [ -z $key_present ] || [ -z $cert_present ] || [ -z $data_dir_present ] || [ -z $log_dir_present ]; then
  echo "When running in development mode through docker, please do not configure"
  echo "any settings for the following values:"
  echo "  [secure] key"
  echo "  [secure] cert"
  echo "  data_dir"
  echo "  log_dir"
  echo "These settings will all be automatically applied from the docker scripts."
  echo "If you truly need to modify this behavior, adjust the script:"
  echo "  docker/docker-entrypoint.sh"
  echo "And rebuild your containers..."
  echo
  echo "Exiting..."
  exit 1
else
  echo "Copying in machine configurations..."
  mkdir -p etc/alcove/machines
  cp -r config/machines/* etc/alcove/machines/

  echo "Appending development values to config"
  echo "data_dir=./data/\n" > etc/alcove/alcove.ini
  echo "log_dir=./logs/\n" >> etc/alcove/alcove.ini
  cat config/alcove.ini >> etc/alcove/alcove.ini
  echo "[secure]\nkey=/etc/alcove/ssl/ssl.key\ncert=/etc/alcove/ssl/ssl.crt" >> etc/alcove/alcove.ini
fi

# Startup server
npm start

