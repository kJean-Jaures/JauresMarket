import http from 'node:http';
import handler from './lib/handler.js';

http.createServer(handler).listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log(`JAURESMARKET — port ${process.env.PORT || 3000}`);
  if (!process.env.ADMIN_PASSWORD) console.log('Mot de passe administrateur : fichier privé .data/admin-password');
});
