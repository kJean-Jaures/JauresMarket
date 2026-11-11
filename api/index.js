import { ConfigurationError, validateCloudConfiguration } from '../lib/config.js';

let handlerPromise;
export default async function api(req, res) {
  try {
    validateCloudConfiguration(process.env);
    handlerPromise ||= import('../lib/handler.js');
    const { default: handler } = await handlerPromise;
    return await handler(req, res);
  } catch (error) {
    handlerPromise = undefined;
    const url = new URL(req.url, 'http://localhost');
    const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\//, '');
    const adminRequest = ['login', 'session'].includes(route) || url.searchParams.get('admin') === '1';
    const known = error instanceof ConfigurationError;
    if (!known) console.error('[JAURESMARKET] Échec du démarrage', { name: error.name, code: error.code || 'ADMIN_STARTUP_FAILED' });
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({
      error: adminRequest ? (known ? error.message : 'Le serveur administrateur ne démarre pas. Consultez les logs du dernier déploiement Vercel : ADMIN_STARTUP_FAILED.') : 'La boutique est en cours de configuration. Réessayez plus tard.',
      code: adminRequest ? (known ? error.code : 'ADMIN_STARTUP_FAILED') : 'SERVICE_UNAVAILABLE'
    }));
  }
}
