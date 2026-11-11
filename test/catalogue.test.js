import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { catalogue } from '../data/catalogue.js';
import { createLocalStore } from '../lib/store.js';

test('Le catalogue importe 42 articles sans prix inventés et préserve les modifications', async () => {
  const directory=await mkdtemp(tmpdir()+'/jm-catalogue-');
  try {
    const store=await createLocalStore(directory);
    assert.equal(catalogue.length,42);
    assert.equal(new Set(catalogue.map(p=>p.id)).size,42);
    assert.ok(catalogue.every(p=>p.price===null&&p.stock===null&&p.images.length===0));
    await store.importCatalogue(catalogue);
    assert.equal((await store.list()).length,42);
    const initial=catalogue[0];
    await store.put(initial.id,{...initial,price:8500,images:[],stock:2});
    await store.put(catalogue[1].id,{...catalogue[1],active:false,deleted:true});
    const anotherInstance=await createLocalStore(directory);
    await anotherInstance.importCatalogue(catalogue);
    assert.equal((await anotherInstance.list()).length,42);
    assert.equal((await anotherInstance.get(initial.id)).price,8500);
    assert.equal((await anotherInstance.get(catalogue[1].id)).deleted,true);
  } finally {await rm(directory,{recursive:true,force:true});}
});
