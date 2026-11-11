const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products = [], editing = null, images = [], imageLoading = false;
async function api(url, options = {}) {
  let r;
  try { r = await fetch(url, { ...options, signal: AbortSignal.timeout(35000), headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch { throw Error('Le serveur ne répond pas. Vérifie ta connexion et réessaie dans un instant.'); }
  let data;
  try { data = await r.json(); }
  catch { throw Error(`Le serveur renvoie une réponse inattendue (HTTP ${r.status}). Vérifie le dernier déploiement Vercel.`); }
  if (!r.ok) {
    if (r.status === 401 && url !== '/api/login') { $('#dashboard').hidden = true; $('#login-panel').hidden = false; }
    throw Error((data.error || 'Une erreur est survenue.') + (data.code ? ' [' + data.code + ']' : ''));
  }
  return data;
}
async function load() {
  products = await api('/api/products?admin=1');
  $('#login-panel').hidden = true; $('#dashboard').hidden = false; render();
}
function render() {
  const term = $('#admin-search').value.toLocaleLowerCase('fr');
  const list = products.filter(p => [p.name, p.category].join(' ').toLocaleLowerCase('fr').includes(term));
  $('#admin-count').textContent = `${products.length} article(s) · ${products.filter(p => p.active).length} visible(s)`;
  $('#admin-products').innerHTML = list.length ? list.map(p => `<article class="admin-row">${globalThis.JauresMedia?.pictures(p).length ? `<div class="admin-thumb">${globalThis.JauresMedia.markup(globalThis.JauresMedia.pictures(p)[0],p.name)}</div>` : '<div class="mini-placeholder">JM</div>'}<div class="admin-product-info"><small>${esc(p.category)} · ${p.active ? 'Visible' : 'Masqué'}</small><h3>${esc(p.name)}</h3><p>${p.price === null ? 'Prix à confirmer' : new Intl.NumberFormat('fr-FR').format(p.price) + ' FCFA'} · Stock : ${p.stock === null ? 'à confirmer' : p.stock}</p></div><button class="button outline" data-edit="${p.id}">Modifier</button><button class="delete-button" data-delete="${p.id}">Supprimer</button></article>`).join('') : '<div class="empty"><h2>Aucun article pour le moment.</h2><p>Ajoute tes photos, tes prix et les détails.</p></div>';
}
$('#admin-search').addEventListener('input', render);
$('#toggle-password').addEventListener('click', () => {
  const input = $('#admin-password'), visible = input.type === 'password';
  input.type = visible ? 'text' : 'password'; $('#toggle-password').textContent = visible ? 'Masquer' : 'Afficher'; $('#toggle-password').setAttribute('aria-pressed', String(visible));
});
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); $('#login-error').textContent = ''; const b = e.target.querySelector('button[type="submit"]'); b.disabled = true; b.textContent = 'Connexion…';
  let connected = false;
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: new FormData(e.target).get('password') }) }); connected = true; await load(); e.target.reset(); $('#admin-password').type = 'password'; $('#toggle-password').textContent = 'Afficher'; $('#toggle-password').setAttribute('aria-pressed', 'false'); }
  catch (err) { $('#login-error').textContent = (connected ? 'Mot de passe accepté, mais le catalogue ne peut pas être chargé. ' : '') + err.message; }
  finally { b.disabled = false; b.textContent = 'Se connecter →'; }
});
$('#logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); products = []; $('#dashboard').hidden = true; $('#login-panel').hidden = false; }
  catch (err) { $('#admin-status').textContent = err.message; }
});
function preview() {
  $('#image-previews').innerHTML = (!images.length && editing && globalThis.JauresIllustrations?.[editing] ? `<div class="admin-illustration-preview">${globalThis.JauresMedia.markup(globalThis.JauresIllustrations[editing], 'Illustration de l’article')}<p class="muted">Illustration provisoire. Ajoute tes photos pour la remplacer.</p></div>` : '') + images.map((image, i) => `<div class="image-preview-item"><img src="${esc(image)}" alt="Photo ${i + 1} de l’article"><small>${i === 0 ? 'Principale' : 'Photo ' + (i + 1)}</small><div><button type="button" data-move="${i}" data-direction="-1" ${i === 0 ? 'disabled' : ''} aria-label="Avancer la photo ${i + 1}">←</button><button type="button" data-move="${i}" data-direction="1" ${i === images.length - 1 ? 'disabled' : ''} aria-label="Reculer la photo ${i + 1}">→</button><button type="button" data-remove="${i}" aria-label="Retirer la photo ${i + 1}">×</button></div></div>`).join('');
}
function edit(p) {
  editing = p?.id || null; images = [...(p?.images?.length ? p.images : p?.image ? [p.image] : [])]; imageLoading = false;
  const form = $('#product-form'); form.reset();
  for (const key of ['name', 'category', 'price', 'stock', 'sizes', 'colors', 'description']) if (p) form.elements[key].value = p[key] ?? '';
  form.elements.active.checked = p ? p.active : true; $('#form-error').textContent = ''; $('#editor-title').textContent = p ? 'Modifier l’article' : 'Ajouter un article'; preview(); $('#editor').showModal();
}
$('#new-product').addEventListener('click', () => edit(null));
$('#editor-close').addEventListener('click', () => { if (!imageLoading) $('#editor').close(); });
$('#editor').addEventListener('cancel', e => { if (imageLoading) e.preventDefault(); });
$('#admin-products').addEventListener('click', async e => {
  const b = e.target.closest('[data-edit],[data-delete]'); if (!b) return;
  if (b.dataset.edit) return edit(products.find(p => p.id === b.dataset.edit));
  const p = products.find(p => p.id === b.dataset.delete);
  if (!confirm(`Supprimer « ${p.name} » ? Cette action est définitive.`)) return;
  try { await api('/api/products/' + p.id, { method: 'DELETE' }); await load(); $('#admin-status').textContent = 'Article supprimé.'; }
  catch (err) { $('#admin-status').textContent = err.message; }
});
$('#image-previews').addEventListener('click', e => {
  if (imageLoading) return;
  const remove = e.target.closest('[data-remove]'); const move = e.target.closest('[data-move]');
  if (remove) images.splice(Number(remove.dataset.remove), 1);
  if (move) { const i = Number(move.dataset.move), j = i + Number(move.dataset.direction); if (j >= 0 && j < images.length) [images[i], images[j]] = [images[j], images[i]]; }
  preview();
});
async function preparePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('Choisis des photos JPG, PNG ou WebP.');
  if (file.size > 20_000_000) throw Error('Cette photo dépasse 20 Mo. Réduis sa taille avant de l’ajouter.');
  const original = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('Impossible de lire la photo.')); r.readAsDataURL(file); });
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('La photo ne peut pas être ouverte.')); i.src = original; });
  if (file.size <= 1_000_000 && Math.max(img.width, img.height) <= 1800) return original;
  const canvas = document.createElement('canvas'), scale = Math.min(1, 1800 / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL('image/webp', .82);
  if (compressed.length > 2_660_000) throw Error('La photo reste trop volumineuse après réduction.');
  return compressed;
}
$('#image-file').addEventListener('change', async e => {
  const files = [...e.target.files]; if (!files.length) return;
  $('#form-error').textContent = '';
  if (files.length + images.length > 8) { $('#form-error').textContent = 'Ajoute au maximum 8 photos par article.'; e.target.value = ''; return; }
  imageLoading = true; $('#save-product').disabled = true; e.target.disabled = true;
  try {
    for (let i = 0; i < files.length; i++) {
      $('#form-error').textContent = `Envoi de la photo ${i + 1} sur ${files.length}…`;
      const image = await preparePhoto(files[i]);
      const saved = await api('/api/images', { method: 'POST', body: JSON.stringify({ image }) });
      images.push(saved.image); preview();
    }
    $('#form-error').textContent = '';
  } catch (err) { $('#form-error').textContent = err.message + ' Les photos déjà envoyées sont conservées.'; }
  finally { imageLoading = false; $('#save-product').disabled = false; e.target.disabled = false; e.target.value = ''; }
});
$('#product-form').addEventListener('submit', async e => {
  e.preventDefault(); if (imageLoading) return;
  const b = $('#save-product'); b.disabled = true; $('#form-error').textContent = '';
  const form = new FormData(e.target), p = Object.fromEntries(form);
  p.images = images; p.active = e.target.elements.active.checked;
  p.price = p.price === '' ? null : Number(p.price); p.stock = p.stock === '' ? null : Number(p.stock);
  try { await api('/api/products' + (editing ? '/' + editing : ''), { method: editing ? 'PUT' : 'POST', body: JSON.stringify(p) }); $('#editor').close(); await load(); $('#admin-status').textContent = 'Article enregistré. La boutique est à jour.'; }
  catch (err) { $('#form-error').textContent = err.message; } finally { b.disabled = false; }
});
api('/api/session').then(s => s.authenticated ? load() : null).catch(err => $('#login-error').textContent = err.message);
