import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {catalogue} from '../data/catalogue.js';

function media(){const context=vm.createContext({});vm.runInContext(readFileSync('public/illustrations.js','utf8'),context);vm.runInContext(readFileSync('public/media.js','utf8'),context);return context.JauresMedia;}
test('Les 42 références possèdent une illustration distincte sur une planche existante',()=>{
 const m=media();const pictures=catalogue.map(p=>m.pictures(p)[0]);assert.equal(new Set(pictures).size,42);
 for(const [i,p]of catalogue.entries()){
  const source=m.pictures(p)[0];assert.ok(existsSync('public'+source.split('#')[0]));assert.equal(m.isIllustrated(p),true);
  const markup=m.markup(source,p.name);assert.match(markup,/visuel d’illustration/);assert.ok(markup.includes(`sheet-col-${i%3}`));
  assert.match(markup,/role="img"/);
 }
});
test('Une vraie photo est prioritaire et le nom reste échappé',()=>{
 const m=media();const p={...catalogue[0],image:'/api/images/photo.jpg',images:['/api/images/photo.jpg']};assert.equal(m.isIllustrated(p),false);assert.equal(m.pictures(p)[0],p.image);
 assert.match(m.markup(p.image,'<script>'),/&lt;script&gt;/);assert.equal(m.markup('/products/collection-4.png#tile=6','invalide'),'');
});
