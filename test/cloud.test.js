import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from '../lib/store.js';
import { Readable } from 'node:stream';

const url = 'https://project.supabase.co';
const key = 'test-only-key';

test('Supabase conserve articles, photos et sessions entre deux instances', async () => {
  const rows = new Map(); const sessions = new Map(); const files = new Map(); let count = 0;
  const fetcher = async (address, options) => {
    assert.equal(options.headers.apikey, key);
    assert.equal(options.headers.Authorization, 'Bearer ' + key);
    const endpoint = new URL(address); const method = options.method || 'GET';
    const payload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const id = endpoint.searchParams.get('id')?.slice(3);
    const token = endpoint.searchParams.get('token')?.slice(3);
    let result = null;
    if (endpoint.pathname === '/rest/v1/products') {
      if (method === 'POST') rows.set(payload.id, payload);
      else if (method === 'DELETE') rows.delete(id);
      else if (id) result = rows.has(id) ? [{ content: rows.get(id).content }] : [];
      else result = [...rows.values()].filter(row => endpoint.searchParams.has('content->>active') ? row.content.active : true);
    } else if (endpoint.pathname.startsWith('/storage/v1/object/product-images/')) {
      assert.equal(method, 'POST'); assert.equal(options.headers['Content-Type'], 'image/png'); files.set(endpoint.pathname, options.body); result = { Key: endpoint.pathname };
    } else if (endpoint.pathname === '/rest/v1/admin_sessions') {
      if (method === 'POST') sessions.set(payload.token, payload.expires);
      else if (method === 'DELETE') sessions.delete(token);
      else result = (sessions.get(token) || 0) > Number(endpoint.searchParams.get('expires').slice(3)) ? [{ token }] : [];
    } else if (endpoint.pathname === '/rest/v1/rpc/allow_admin_login') {
      assert.equal(payload.client_key, 'test-ip-hash'); result = ++count <= 10;
    } else if (endpoint.pathname === '/rest/v1/admin_login_attempts') { count = 0; }
    else throw Error('Unexpected endpoint: ' + endpoint.pathname);
    return new Response(result === null ? null : JSON.stringify(result), { status: result === null ? 204 : 200 });
  };
  const first = createSupabaseStore({url,key,fetcher});
  const second = createSupabaseStore({url,key,fetcher});
  const photo = 'data:image/png;base64,aGVsbG8=';
  const image = await first.saveImage(photo);
  assert.equal(files.size, 1); assert.equal(first.acceptsImage(image), true);
  assert.equal(first.acceptsImage('https://evil.example/image.png'), false);
  assert.equal(first.acceptsImage(url+'/storage/v1/object/public/product-images/../../admin'), false);
  const id = 'a'.repeat(24);
  await first.put(id,{name:'Test',active:true,image});
  assert.equal((await second.list())[0].image,image);
  await second.put(id,{name:'Test',active:false,image});
  assert.deepEqual(await first.list(),[]);assert.equal((await first.list(true)).length,1);
  assert.equal(await second.saveImage(image),image);assert.equal(files.size,1);
  await first.addSession('token-hash',Date.now()+60_000);assert.equal(await second.hasSession('token-hash'),true);
  await second.deleteSession('token-hash');assert.equal(await first.hasSession('token-hash'),false);
  await first.addSession('expired',Date.now()-1);assert.equal(await second.hasSession('expired'),false);
  for(let i=0;i<10;i++)assert.equal(await first.allowLogin('test-ip-hash'),true);
  assert.equal(await second.allowLogin('test-ip-hash'),false);
  await second.clearLogin('test-ip-hash');assert.equal(await first.allowLogin('test-ip-hash'),true);
  await first.remove(id);assert.equal(await second.get(id),null);
});

test('Les erreurs Supabase ne divulguent pas les réponses ni les clés', async () => {
  const store=createSupabaseStore({url,key,fetcher:async()=>new Response('private-provider-detail',{status:403})});
  await assert.rejects(()=>store.list(),error=>!error.message.includes('private-provider-detail')&&!error.message.includes(key)&&error.message.includes('Supabase'));
  assert.throws(()=>createSupabaseStore({url:'http://insecure.example',key}));
});

test('Le point d’entrée Vercel accepte le corps déjà analysé et réécrit les routes', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const directory=await mkdtemp(tmpdir()+'/jm-handler-');
  process.env.DATA_DIR=directory;process.env.ADMIN_PASSWORD='test-handler-password';
  delete process.env.VERCEL;delete process.env.SUPABASE_URL;
  try {
    const {default:handler}=await import('../lib/handler.js');
    async function call(route,method='GET',body,cookie) {
      const req=Readable.from([]);Object.assign(req,{url:'/api/index?route='+route,method,body,headers:{host:'localhost',cookie},socket:{remoteAddress:'127.0.0.1'}});
      const headers={};let status;let value;
      const res={setHeader:(name,value)=>headers[name]=value,writeHead:(s,h)=>{status=s;Object.assign(headers,h);},end:text=>{value=JSON.parse(text);}};
      await handler(req,res);return {status,value,headers};
    }
    const login=await call('login','POST',{password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);
    const cookie=login.headers['Set-Cookie'].split(';')[0];
    const product={name:'Test Vercel',category:'Femme',price:2000,stock:1};
    assert.equal((await call('products','POST',product,cookie)).status,201);
    assert.equal((await call('products')).value[0].name,'Test Vercel');
    assert.equal((await call('products','POST',null,cookie)).status,400);
    assert.equal((await call('products','POST',{...product,image:'a'.repeat(3_000_001)},cookie)).status,400);
    await call('logout','POST',{},cookie);assert.equal((await call('session','GET',undefined,cookie)).value.authenticated,false);
  } finally {await rm(directory,{recursive:true,force:true});}
});
