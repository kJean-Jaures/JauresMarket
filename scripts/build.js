import { writeFileSync } from 'node:fs';
import { catalogue } from '../data/catalogue.js';

const reference = catalogue.filter(p => p.active && !p.deleted).map(p => ({ ...p, price: null, stock: null }));
writeFileSync(new URL('../public/catalogue.json', import.meta.url), JSON.stringify(reference));
console.log(`Catalogue de secours : ${reference.length} références`);
