let handlerPromise;
export default async function api(req, res) {
  try {
    handlerPromise ||= import('../lib/handler.js');
    const { default: handler } = await handlerPromise;
    return await handler(req, res);
  } catch {
    handlerPromise = undefined;
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'La boutique est en cours de configuration. Réessayez plus tard.' }));
  }
}
