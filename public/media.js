(() => {
  const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function generated(source) { return /^\/products\/collection-([1-4])\.png#tile=(\d+)$/.exec(source || ''); }
  function pictures(product) {
    if (product.images?.length) return product.images;
    if (product.image) return [product.image];
    const illustration = globalThis.JauresIllustrations?.[product.id];
    return illustration ? [illustration] : [];
  }
  function markup(source, name) {
    const match = generated(source);
    if (!match) return `<img src="${escape(source)}" alt="${escape(name)}" loading="lazy" decoding="async">`;
    const collection = Number(match[1]), tile = Number(match[2]), limit = collection === 4 ? 6 : 12;
    if (tile >= limit) return '';
    return `<span class="sheet-photo sheet-rows-${collection === 4 ? 2 : 4} sheet-col-${tile % 3} sheet-row-${Math.floor(tile / 3)}" role="img" aria-label="${escape(name)} — visuel d’illustration"><img src="/products/collection-${collection}.png" alt="" loading="lazy" decoding="async"></span>`;
  }
  globalThis.JauresMedia = { pictures, markup, isIllustrated: product => Boolean(generated(pictures(product)[0])) };
})();
