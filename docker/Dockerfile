FROM node:10.18.1-stretch

# Create app directories
RUN mkdir -p /etc/alcove/ssl; \
    mkdir /src
WORKDIR /opt/alcove/
COPY docker-entrypoint.sh docker-entrypoint.sh

# Install the global gulp executable (container global)
RUN npm install gulp -g

# Install sendmail compatible executable
RUN apt-get update && apt-get install -y ssmtp && echo "FromLineOverride=YES" >> /etc/ssmtp/ssmtp.conf

# Install openssh-client package for key generation, use rsa protocol
# Place keys inside /home/node/.ssh and set ownership to node user
RUN mkdir /home/node/.ssh; \
    ssh-keygen -t rsa -N '' -f /home/node/.ssh/id_rsa; \
    chown node:node -R /home/node/.ssh
# Turn off StrictHostKeyChecking
RUN echo "StrictHostKeyChecking no" >> /etc/ssh/ssh_config

# Install rsync, sudo
RUN apt-get install -y rsync sudo

# Generate self-signed cert
# TODO: allow for an env variable to specify the cert params
RUN mkdir -p etc/alcove/ssl/; \
  openssl ecparam -out etc/alcove/ssl/ssl.key -name prime256v1 -genkey; \
  openssl req -x509 -new -key etc/alcove/ssl/ssl.key -out etc/alcove/ssl/ssl.crt -days 365 -subj "/C=US/ST=Iowa/L=Coralville/O=Bio::Neos, Inc./CN=localhost"


# Drop privileges, retain sudo capability for data/logs
RUN chown -R node:node .
RUN echo 'Cmnd_Alias CHMOD=/bin/chmod 777 /src/*' >> /etc/sudoers; \
    echo 'node ALL=(ALL:ALL) NOPASSWD:CHMOD' >> /etc/sudoers
USER node
EXPOSE 3000

CMD [ "/opt/alcove/docker-entrypoint.sh" ]
