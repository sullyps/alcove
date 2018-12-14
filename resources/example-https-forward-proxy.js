const fs = require('fs');
const app = require('express')();
const proxy = require('express-http-proxy');
const ALCOVE = 'https://localhost:3333/';
 

app.use('/', proxy(ALCOVE, {
    proxyReqOptDecorator: (pReq, srcReq) => {
      pReq.headers['X-Forwarded-Proto'] = 'https';
      return pReq;
    },
  })
);

let cred = {
  key: fs.readFileSync('../etc/backup/ssl/ssl.key', 'utf-8'),
  cert: fs.readFileSync('../etc/backup/ssl/ssl.crt', 'utf-8')
}; 

require('https').createServer(cred, app).listen(3443);
