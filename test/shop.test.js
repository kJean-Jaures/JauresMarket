import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('Administration protégée et cycle complet des articles persistants', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'jm-test-'));
 const port=String(18000+Math.floor(Math.random()*10000));
 const password='test-only-'+Date.now();
 let child;
 async function start(){child=spawn(process.execPath,['server.js'],{env:{...process.env,VERCEL:'',SUPABASE_URL:'',PORT:port,HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_PASSWORD:password},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Démarrage trop long')),10000);child.stdout.on('data',chunk=>{if(chunk.toString().includes('JAURESMARKET')){clearTimeout(timeout);resolve();}});child.once('exit',code=>{clearTimeout(timeout);reject(Error('Serveur arrêté : '+code));});});}
 async function stop(){const exited=once(child,'exit');child.kill();await exited;}
 const base='http://127.0.0.1:'+port;
 const request=(url,method='GET',value,cookie)=>fetch(base+url,{method,headers:{...(value?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:value?JSON.stringify(value):undefined});
 try{
 await start();
 assert.equal((await request('/')).status,200);
 assert.equal((await request('/admin')).status,200);
 assert.deepEqual(await (await request('/api/products')).json(),[]);
 assert.equal((await request('/api/products?admin=1')).status,401);
 assert.equal((await request('/api/products','POST',{})).status,401);
 assert.equal((await request('/api/login','POST',{password:'incorrect'})).status,401);
 const login=await request('/api/login','POST',{password});assert.equal(login.status,200);
 let cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await (await request('/api/session','GET',null,cookie)).json()).authenticated,true);
 const product={name:'Article de test',category:'Homme',description:'Coton',price:15000,stock:3,sizes:'M, L',colors:'Noir',active:true,image:''};
 const forbidden=await fetch(base+'/api/products',{method:'POST',headers:{Origin:'https://autre.example','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(product)});assert.equal(forbidden.status,403);
 assert.equal((await request('/api/products','POST',{...product,price:-1},cookie)).status,400);
 assert.equal((await request('/api/products','POST',{...product,image:'javascript:alert(1)'},cookie)).status,400);
 const created=await request('/api/products','POST',product,cookie);assert.equal(created.status,201);const p=await created.json();
 assert.equal((await (await request('/api/products')).json())[0].price,15000);
 assert.equal((await request('/api/products/'+p.id,'PUT',{...product,price:12000,active:false},cookie)).status,200);
 assert.deepEqual(await (await request('/api/products')).json(),[]);
 assert.equal((await (await request('/api/products?admin=1','GET',null,cookie)).json())[0].price,12000);
 await stop();await start();
 assert.equal((await request('/api/products?admin=1','GET',null,cookie)).status,200);
 const again=await request('/api/login','POST',{password});cookie=again.headers.get('set-cookie').split(';')[0];
 assert.equal((await (await request('/api/products?admin=1','GET',null,cookie)).json())[0].id,p.id);
 assert.equal((await request('/api/products/'+p.id,'DELETE',null,cookie)).status,200);
 assert.deepEqual(await (await request('/api/products?admin=1','GET',null,cookie)).json(),[]);
 assert.equal((await request('/api/logout','POST',null,cookie)).status,200);
 assert.equal((await request('/api/products?admin=1','GET',null,cookie)).status,401);
 await stop();await start();
 assert.equal((await request('/api/products?admin=1','GET',null,cookie)).status,401);
 for(let i=0;i<10;i++)assert.equal((await request('/api/login','POST',{password:'incorrect'})).status,401);
 await stop();await start();
 assert.equal((await request('/api/login','POST',{password})).status,429);
 }finally{if(child?.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});
