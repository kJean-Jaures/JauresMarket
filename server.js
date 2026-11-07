import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = process.env.DATA_DIR || path.join(root, '.data');
mkdirSync(data, { recursive: true });
const passwordFile = path.join(data, 'admin-password');
if (!process.env.ADMIN_PASSWORD && !existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(24).toString('base64url'), { mode: 0o600 });
const salt = randomBytes(16);
const passwordHash = scryptSync(process.env.ADMIN_PASSWORD || readFileSync(passwordFile, 'utf8').trim(), salt, 64);
const db = new DatabaseSync(path.join(data, 'shop.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, content TEXT NOT NULL);`);
const sessions = new Map();
const attempts = new Map();
const categories = ['Homme', 'Femme', 'Pagnes & tissus', 'Sous-vêtements', 'Chaussures', 'Accessoires'];
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 9_000_000) throw new Error('Fichier trop volumineux (6 Mo maximum par photo).'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function authenticated(req) {
  const token = /(?:^|;\s*)jm_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) { sessions.delete(token); return false; }
  return true;
}
function validate(input) {
  const text = (key, max) => String(input[key] ?? '').trim().slice(0, max);
  const product = { name: text('name', 120), category: text('category', 60), description: text('description', 3000), sizes: text('sizes', 200), colors: text('colors', 200), price: Number(input.price), stock: Number(input.stock), image: text('image', 8_500_000), active: input.active !== false };
  if (!product.name || !categories.includes(product.category) || !Number.isSafeInteger(product.price) || product.price < 0 || !Number.isSafeInteger(product.stock) || product.stock < 0) throw new Error('Vérifiez le nom, la catégorie, le prix et le stock.');
  if (product.image && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(product.image)) throw new Error('Ajoutez une photo JPG, PNG ou WebP.');
  if (product.image.length > 8_400_000) throw new Error('La photo dépasse 6 Mo.');
  return product;
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`) return json(res, 403, { error: 'Origine refusée.' });
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const key = req.socket.remoteAddress; const now = Date.now();
        const attempt = attempts.get(key) || { count: 0, until: now + 600_000 };
        if (attempt.until < now) { attempt.count = 0; attempt.until = now + 600_000; }
        if (attempt.count >= 10) return json(res, 429, { error: 'Trop de tentatives. Réessayez dans 10 minutes.' });
        const input = await body(req);
        const hash = scryptSync(String(input.password || '').slice(0, 1024), salt, 64);
        if (!timingSafeEqual(hash, passwordHash)) { attempt.count++; attempts.set(key, attempt); return json(res, 401, { error: 'Mot de passe incorrect.' }); }
        attempts.delete(key);
        for (const [token, session] of sessions) if (session.expires < now) sessions.delete(token);
        const token = randomBytes(32).toString('hex'); sessions.set(token, { expires: now + 28_800_000 });
        res.setHeader('Set-Cookie', `jm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        sessions.delete(/(?:^|;\s*)jm_session=([^;]+)/.exec(req.headers.cookie || '')?.[1]);
        res.setHeader('Set-Cookie', 'jm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/session') return json(res, 200, { authenticated: authenticated(req) });
      if (url.pathname === '/api/products' && req.method === 'GET') {
        const admin = url.searchParams.get('admin') === '1';
        if (admin && !authenticated(req)) return json(res, 401, { error: 'Connectez-vous.' });
        const products = db.prepare('SELECT id, content FROM products ORDER BY rowid DESC').all().map(row => ({ ...JSON.parse(row.content), id: row.id }));
        return json(res, 200, products.filter(p => admin || p.active));
      }
      if (url.pathname === '/api/products' && req.method === 'POST') {
        if (!authenticated(req)) return json(res, 401, { error: 'Connectez-vous.' });
        const p = validate(await body(req)); const id = randomBytes(12).toString('hex');
        db.prepare('INSERT INTO products VALUES (?, ?)').run(id, JSON.stringify(p)); return json(res, 201, { ...p, id });
      }
      const match = /^\/api\/products\/([a-f0-9]{24})$/.exec(url.pathname);
      if (match && ['PUT', 'DELETE'].includes(req.method)) {
        if (!authenticated(req)) return json(res, 401, { error: 'Connectez-vous.' });
        if (!db.prepare('SELECT id FROM products WHERE id = ?').get(match[1])) return json(res, 404, { error: 'Article introuvable.' });
        if (req.method === 'DELETE') db.prepare('DELETE FROM products WHERE id = ?').run(match[1]);
        else db.prepare('UPDATE products SET content = ? WHERE id = ?').run(JSON.stringify(validate(await body(req))), match[1]);
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'Page introuvable.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Méthode refusée.' });
    const files = { '/': 'index.html', '/admin': 'admin.html', '/style.css': 'style.css', '/app.js': 'app.js', '/admin.js': 'admin.js', '/logo.png': 'logo.png', '/campaign.png': 'campaign.png' };
    const file = files[url.pathname];
    if (!file) return json(res, 404, { error: 'Page introuvable.' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-cache' }); res.end(readFileSync(path.join(root, 'public', file)));
  } catch (error) { json(res, error instanceof SyntaxError ? 400 : 400, { error: error.message || 'Requête invalide.' }); }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log(`JAURESMARKET — port ${process.env.PORT || 3000}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`Mot de passe administrateur : fichier privé ${passwordFile}`);
});
