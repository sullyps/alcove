FROM node:9

# Create app directories
RUN ln -s /opt/backup/etc/backup /etc/backup
WORKDIR /opt/backup/

# Install the global gulp executable
RUN npm install gulp -g

# Prevent 404 error on apt-get commands as per https://superuser.com/a/1423685
RUN printf "deb http://archive.debian.org/debian/ jessie main\ndeb-src http://archive.debian.org/debian/ jessie main\ndeb http://security.debian.org jessie/updates main\ndeb-src http://security.debian.org jessie/updates main" > /etc/apt/sources.list

# Install sendmail compatible executable
RUN apt-get update && apt-get install ssmtp && echo "FromLineOverride=YES" >> /etc/ssmtp/ssmtp.conf

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
