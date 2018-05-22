FROM node:9

# Create app directories
RUN ln -s /opt/backup/etc/backup /etc/backup
WORKDIR /opt/backup/

# Install the global gulp executable
RUN npm install gulp -g

# Install sendmail compatible executable
RUN apt-get update && apt-get install ssmtp && echo "FromLineOverride=YES" >> /etc/ssmtp/ssmtp.conf

# Drop privileges
USER node
EXPOSE 3000

CMD [ "npm", "start" ]
