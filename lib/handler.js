import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLocalStore, createSupabaseStore } from './store.js';
import { catalogue } from '../data/catalogue.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cloud = Boolean(process.env.VERCEL || process.env.SUPABASE_URL);
if (cloud && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ADMIN_PASSWORD)) throw Error('Configuration serveur manquante : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et ADMIN_PASSWORD requis.');
if (cloud && process.env.ADMIN_PASSWORD.length < 16) throw Error('ADMIN_PASSWORD doit contenir au moins 16 caractères.');
const secureCookie = cloud || process.env.COOKIE_SECURE === 'true';
const data = process.env.DATA_DIR || path.join(root, '.data');
if (!cloud) mkdirSync(data, { recursive: true });
const passwordFile = path.join(data, 'admin-password');
if (!process.env.ADMIN_PASSWORD && !existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(24).toString('base64url'), { mode: 0o600 });
const salt = randomBytes(16);
const passwordHash = scryptSync(process.env.ADMIN_PASSWORD || readFileSync(passwordFile, 'utf8').trim(), salt, 64);
const store = cloud ? createSupabaseStore({url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY}) : await createLocalStore(data);
const passwordVersion = createHash('sha256').update(process.env.ADMIN_PASSWORD || readFileSync(passwordFile, 'utf8').trim()).digest('hex');
let catalogueReady;
async function ensureCatalogue() {
  if (process.env.IMPORT_WHATSAPP_CATALOGUE === 'false') return;
  catalogueReady ||= store.importCatalogue(catalogue).catch(error => { catalogueReady = undefined; throw error; });
  await catalogueReady;
}
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const sessionHash = token => tokenHash(token + passwordVersion);
const sessionToken = req => /(?:^|;\s*)jm_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
const categories = ['Homme', 'Femme', 'Pagnes & tissus', 'Sous-vêtements', 'Chaussures', 'Accessoires'];
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 3_000_000) throw Error('Fichier trop volumineux (2 Mo maximum par photo).');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Requête invalide.');
    return parsed;
  }
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 3_000_000) throw new Error('Fichier trop volumineux (2 Mo maximum par photo).'); chunks.push(chunk); }
  const parsed = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Requête invalide.');
  return parsed;
}
async function authenticated(req) {
  const token = sessionToken(req);
  return token ? await store.hasSession(sessionHash(token)) : false;
}
function validateImage(image) {
  if (typeof image !== 'string' || !image || !store.acceptsImage(image)) throw Error('Ajoutez une photo JPG, PNG ou WebP.');
  if (image.length > 2_800_000 || (image.startsWith('data:') && Buffer.from(image.split(',')[1], 'base64').length > 2_000_000)) throw Error('La photo dépasse 2 Mo.');
  return image;
}
function validate(input) {
  const text = (key, max) => String(input[key] ?? '').trim().slice(0, max);
  const price = input.price === null || input.price === '' ? null : Number(input.price);
  const stock = input.stock === null || input.stock === '' ? null : Number(input.stock);
  const images = input.images === undefined ? (input.image ? [input.image] : []) : input.images;
  if (!Array.isArray(images) || images.length > 8) throw Error('Ajoutez au maximum 8 photos par article.');
  const product = { name: text('name', 120), category: text('category', 60), description: text('description', 3000), sizes: text('sizes', 200), colors: text('colors', 200), price, stock, images: [...new Set(images.map(validateImage))], active: input.active !== false };
  product.image = product.images[0] || '';
  if (!product.name || !categories.includes(product.category) || (price !== null && (!Number.isSafeInteger(price) || price < 0)) || (stock !== null && (!Number.isSafeInteger(stock) || stock < 0))) throw Error('Vérifiez le nom, la catégorie, le prix et le stock.');
  return product;
}
async function savePhotos(product) {
  product.images = await Promise.all(product.images.map(image => store.saveImage(image)));
  product.image = product.images[0] || '';
}
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', `default-src 'self'; img-src 'self' data:${cloud ? " " + new URL(process.env.SUPABASE_URL).origin : ""}; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/index' && url.searchParams.has('route')) url.pathname = '/api/' + url.searchParams.get('route');
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin && req.headers.origin !== `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`) return json(res, 403, { error: 'Origine refusée.' });
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const key = tokenHash((process.env.VERCEL ? req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() : req.socket.remoteAddress) || 'unknown');
        if (!await store.allowLogin(key)) return json(res, 429, { error: 'Trop de tentatives. Réessayez dans 10 minutes.' });
        const input = await body(req);
        const hash = scryptSync(String(input.password || '').slice(0, 1024), salt, 64);
        if (!timingSafeEqual(hash, passwordHash)) return json(res, 401, { error: 'Mot de passe incorrect.' });
        await store.clearLogin(key);
        const token = randomBytes(32).toString('hex');
        await store.addSession(sessionHash(token), Date.now() + 28_800_000);
        res.setHeader('Set-Cookie', `jm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie ? '; Secure' : ''}`);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        const token = sessionToken(req);
        if (token) await store.deleteSession(sessionHash(token));
        res.setHeader('Set-Cookie', `jm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}`); return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/session') return json(res, 200, { authenticated: await authenticated(req) });
      if (url.pathname === '/api/images' && req.method === 'POST') {
        if (!await authenticated(req)) return json(res, 401, { error: 'Connectez-vous.' });
        const { image } = await body(req);
        return json(res, 201, { image: await store.saveImage(validateImage(image)) });
      }
      if (url.pathname.startsWith('/api/images/') && req.method === 'GET' && store.readImage) {
        const name = url.pathname.slice('/api/images/'.length);
        const image = await store.readImage(name);
        if (!image) return json(res, 404, { error: 'Photo introuvable.' });
        res.writeHead(200, { 'Content-Type': 'image/' + (name.endsWith('.jpg') ? 'jpeg' : name.split('.').pop()), 'Cache-Control': 'public, max-age=31536000, immutable' });
        return res.end(image);
      }
      if (url.pathname === '/api/products' && req.method === 'GET') {
        const admin = url.searchParams.get('admin') === '1';
        if (admin && !await authenticated(req)) return json(res, 401, { error: 'Connectez-vous.' });
        await ensureCatalogue();
        const products = await store.list(admin);
        return json(res, 200, products.filter(p => !p.deleted && (admin || p.active)));
      }
      if (url.pathname === '/api/products' && req.method === 'POST') {
        if (!await authenticated(req)) return json(res, 401, { error: 'Connectez-vous.' });
        const p = validate(await body(req)); const id = randomBytes(12).toString('hex');
        await savePhotos(p); await store.put(id, p); return json(res, 201, { ...p, id });
      }
      const match = /^\/api\/products\/([a-f0-9]{24})$/.exec(url.pathname);
      if (match && ['PUT', 'DELETE'].includes(req.method)) {
        if (!await authenticated(req)) return json(res, 401, { error: 'Connectez-vous.' });
        if (!await store.get(match[1])) return json(res, 404, { error: 'Article introuvable.' });
        if (req.method === 'DELETE') {
          const existing = await store.get(match[1]);
          if (catalogue.some(p => p.id === match[1])) await store.put(match[1], { ...existing, active: false, deleted: true });
          else await store.remove(match[1]);
        }
        else { const p = validate(await body(req)); await savePhotos(p); await store.put(match[1], p); }
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
  } catch (error) {
    const serviceFailure = error.message?.startsWith('Supabase');
    json(res, serviceFailure ? 503 : 400, { error: error.message || 'Requête invalide.' });
  }
}
