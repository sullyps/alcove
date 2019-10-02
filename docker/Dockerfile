FROM node:8

# Create app directories
RUN ln -s /opt/backup/etc/backup /etc/backup
WORKDIR /opt/backup/

# Install the global gulp executable
RUN npm install gulp -g

# Install sendmail compatible executable
RUN apt-get update && apt-get install -y ssmtp && echo "FromLineOverride=YES" >> /etc/ssmtp/ssmtp.conf

# Install openssh-client package for key generation, use rsa protocol
# Place keys inside /home/node/.ssh and set ownership to node user
RUN apt-get install -y openssh-client && mkdir /home/node/.ssh && ssh-keygen -t rsa -N '' -f /home/node/.ssh/id_rsa && chown node:node -R /home/node/.ssh

# Configure StrictHostKeyChecking to 'no'
RUN echo "StrictHostKeyChecking no" >> /etc/ssh/ssh_config

# Install rsync
RUN apt-get install -y rsync

# Drop privileges
USER node
EXPOSE 3000

CMD [ "npm", "start" ]
