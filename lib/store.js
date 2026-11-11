import { randomBytes } from 'node:crypto';

export async function createLocalStore(directory) {
  const { mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
  const { DatabaseSync } = await import('node:sqlite');
  const { join } = await import('node:path');
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(directory, 'images'), { recursive: true });
  const db = new DatabaseSync(join(directory, 'shop.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, content TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);`);
  return {
    async list() { return db.prepare('SELECT id, content FROM products ORDER BY rowid DESC').all().map(r => ({ ...JSON.parse(r.content), id: r.id })); },
    async get(id) { const r = db.prepare('SELECT content FROM products WHERE id=?').get(id); return r ? JSON.parse(r.content) : null; },
    async put(id, content) { db.prepare('INSERT INTO products(id,content) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(id, JSON.stringify(content)); },
    async remove(id) { db.prepare('DELETE FROM products WHERE id=?').run(id); },
    async importCatalogue(products) {
      db.exec('BEGIN IMMEDIATE');
      try { for (const { id, ...content } of products) db.prepare('INSERT OR IGNORE INTO products VALUES (?,?)').run(id, JSON.stringify(content)); db.exec('COMMIT'); }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async saveImage(image) {
      if (!image || image.startsWith('/api/images/')) return image;
      const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(image);
      if (!match) throw Error('Format de photo invalide.');
      const name = randomBytes(24).toString('hex') + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]);
      writeFileSync(join(directory, 'images', name), Buffer.from(match[2], 'base64'));
      return '/api/images/' + name;
    },
    async readImage(name) { if (!/^[a-f0-9]{48}\.(jpg|png|webp)$/.test(name)) return null; try { return readFileSync(join(directory, 'images', name)); } catch { return null; } },
    acceptsImage(image) { return !image || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || /^\/api\/images\/[a-f0-9]{48}\.(jpg|png|webp)$/.test(image); },
    async addSession(token, expires) { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); db.prepare('INSERT INTO sessions VALUES(?,?)').run(token, expires); },
    async hasSession(token) { return (db.prepare('SELECT expires FROM sessions WHERE token=?').get(token)?.expires || 0) > Date.now(); },
    async deleteSession(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(token); },
    async allowLogin(key) {
      const now = Date.now();
      db.prepare('DELETE FROM login_attempts WHERE until < ?').run(now);
      db.prepare('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 600_000);
      return db.prepare('SELECT count FROM login_attempts WHERE key=?').get(key).count <= 10;
    },
    async clearLogin(key) { db.prepare('DELETE FROM login_attempts WHERE key=?').run(key); }
  };
}

export function createSupabaseStore({ url, key, fetcher = fetch }) {
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('SUPABASE_URL doit être une URL HTTPS sans chemin.');
  const base = origin.origin;
  const imagePrefix = base + '/storage/v1/object/public/product-images/';
  async function request(endpoint, options = {}) {
    let response;
    try {
      response = await fetcher(base + endpoint, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, ...options.headers }, signal: AbortSignal.timeout(20_000) });
    } catch { const error = Error('Supabase est injoignable. Réessayez dans un instant.'); error.code = 'SUPABASE_UNREACHABLE'; error.status = 503; throw error; }
    if (!response.ok) {
      let providerCode;
      try { providerCode = (await response.json()).code; } catch {}
      let code = 'SUPABASE_REQUEST_FAILED';
      let message = 'Supabase a refusé la requête. Vérifiez la configuration et le schéma de la boutique.';
      if (response.status === 401) { code = 'SUPABASE_KEY_REJECTED'; message = 'Supabase refuse la clé serveur. Vérifiez que SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY viennent du même projet, puis redéployez Vercel.'; }
      else if (['42P01', 'PGRST205', '42883', 'PGRST202'].includes(providerCode)) { code = 'SUPABASE_SCHEMA_MISSING'; message = 'La base Supabase n’est pas prête. Exécutez le fichier supabase/schema.sql du dépôt dans SQL Editor, puis réessayez.'; }
      else if (response.status === 403 || providerCode === '42501') { code = 'SUPABASE_PERMISSION_DENIED'; message = 'Supabase refuse l’accès aux tables. Vérifiez la clé service_role et exécutez supabase/schema.sql dans le bon projet.'; }
      const error = Error(message); error.code = code; error.status = 503; throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const json = value => ({ 'Content-Type': 'application/json', Prefer: 'return=minimal', ...value });
  return {
    async list(admin = false) {
      const rows = await request('/rest/v1/products?select=id,content&order=created_at.desc,id.desc' + (admin ? '' : '&content->>active=eq.true'));
      return rows.map(r => ({ ...r.content, id: r.id }));
    },
    async importCatalogue(products) { await request('/rest/v1/products?on_conflict=id', { method: 'POST', headers: json({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), body: JSON.stringify(products.map(({ id, ...content }) => ({ id, content }))) }); },
    async get(id) { return (await request(`/rest/v1/products?id=eq.${id}&select=content&limit=1`))[0]?.content || null; },
    async put(id, content) { await request('/rest/v1/products?on_conflict=id', { method: 'POST', headers: json({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ id, content }) }); },
    async remove(id) { await request(`/rest/v1/products?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
    acceptsImage(image) { return !image || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || (image.startsWith(imagePrefix) && /^[a-f0-9]{48}\.(jpg|png|webp)$/.test(image.slice(imagePrefix.length))); },
    async saveImage(image) {
      if (!image || image.startsWith(imagePrefix)) return image;
      const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(image);
      if (!match) throw Error('Format de photo invalide.');
      const type = match[1]; const name = randomBytes(24).toString('hex') + '.' + (type === 'jpeg' ? 'jpg' : type);
      await request('/storage/v1/object/product-images/' + name, { method: 'POST', headers: { 'Content-Type': 'image/' + type }, body: Buffer.from(match[2], 'base64') });
      return imagePrefix + name;
    },
    async addSession(token, expires) { await request('/rest/v1/admin_sessions', { method: 'POST', headers: json(), body: JSON.stringify({ token, expires }) }); },
    async hasSession(token) { return (await request(`/rest/v1/admin_sessions?token=eq.${token}&expires=gt.${Date.now()}&select=token&limit=1`)).length > 0; },
    async deleteSession(token) { await request(`/rest/v1/admin_sessions?token=eq.${token}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); },
    async allowLogin(key) { return await request('/rest/v1/rpc/allow_admin_login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_key: key }) }); },
    async clearLogin(key) { await request(`/rest/v1/admin_login_attempts?key=eq.${key}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
  };
}
