FROM node:9

# Create app directories
RUN ln -s /opt/backup/etc/backup /etc/backup
WORKDIR /opt/backup/

# Install the global gulp executable
RUN npm install gulp -g

# Drop privileges
USER node
EXPOSE 3000

CMD [ "npm", "start" ]
