import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const reference = JSON.parse(readFileSync(new URL('../public/catalogue.json', import.meta.url), 'utf8'));
async function cataloguePage(fetcher) {
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { value: selector === '#sort' ? 'recent' : '', hidden: true, textContent: '', innerHTML: '', addEventListener() {}, classList: { add() {}, remove() {} } });
      return elements.get(selector);
    },
    querySelectorAll() { return []; }
  };
  const context = vm.createContext({ document, localStorage: { getItem() { return null; }, setItem() {} }, fetch: fetcher, AbortSignal, setTimeout, clearTimeout });
  vm.runInContext(source.replace(/loadCatalogue\(\);\s*$/, 'globalThis.loaded = loadCatalogue();'), context);
  await context.loaded;
  return elements;
}

test('Une erreur API affiche les 42 références avec prix à confirmer', async () => {
  const calls = [];
  const elements = await cataloguePage(async url => {
    calls.push(url);
    return url === '/api/products' ? { ok: false } : { ok: true, json: async () => reference };
  });
  assert.deepEqual(calls, ['/api/products', '/catalogue.json']);
  assert.equal(elements.get('#product-count').textContent, '42 articles');
  assert.match(elements.get('#products').innerHTML, /Ensemble cargo treillis/);
  assert.match(elements.get('#products').innerHTML, /Prix à confirmer/);
  assert.equal(elements.get('#catalogue-status').hidden, false);
});

test('Un catalogue API volontairement vide ne réaffiche pas les références supprimées', async () => {
  const calls = [];
  const elements = await cataloguePage(async url => { calls.push(url); return { ok: true, json: async () => [] }; });
  assert.deepEqual(calls, ['/api/products']);
  assert.equal(elements.get('#product-count').textContent, '0 article');
  assert.equal(elements.get('#catalogue-status').hidden, true);
});

test('Une réponse API invalide utilise aussi le catalogue de référence', async () => {
  const elements = await cataloguePage(async url => ({ ok: true, json: async () => url === '/api/products' ? { error: 'invalid' } : reference }));
  assert.equal(elements.get('#product-count').textContent, '42 articles');
});

test('Si les deux chargements échouent, le catalogue WhatsApp reste accessible', async () => {
  const elements = await cataloguePage(async () => { throw Error('Réseau indisponible'); });
  assert.match(elements.get('#products').innerHTML, /https:\/\/wa.me\/c\/22574763873/);
  assert.doesNotMatch(elements.get('#products').innerHTML, /Le catalogue ne charge pas/);
});
