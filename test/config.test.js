import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCloudConfiguration } from '../lib/config.js';
import { createSupabaseStore } from '../lib/store.js';
import api from '../api/index.js';

const complete = { VERCEL: '1', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only-server-key', ADMIN_PASSWORD: 'test-only-password-long' };
test('Les erreurs de configuration identifient les champs sans exposer leurs valeurs', () => {
  for (const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_PASSWORD']) {
    assert.throws(() => validateCloudConfiguration({...complete,[name]:''}), e=>e.code==='CONFIG_MISSING' && e.message.includes(name) && !e.message.includes(complete.ADMIN_PASSWORD) && !e.message.includes(complete.SUPABASE_SERVICE_ROLE_KEY));
  }
  assert.throws(()=>validateCloudConfiguration({...complete,ADMIN_PASSWORD:'short'}),e=>e.code==='ADMIN_PASSWORD_TOO_SHORT');
  assert.throws(()=>validateCloudConfiguration({...complete,SUPABASE_URL:'not-a-url-with-private-text'}),e=>e.code==='SUPABASE_URL_INVALID'&&!e.message.includes('private-text'));
  assert.throws(()=>validateCloudConfiguration({...complete,SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_test'}),e=>e.code==='SUPABASE_KEY_PUBLIC');
  assert.doesNotThrow(()=>validateCloudConfiguration(complete));
});

test('Le formulaire reçoit un diagnostic de démarrage au lieu du message générique', async () => {
  const original={...process.env};
  try {
    Object.assign(process.env,complete);delete process.env.SUPABASE_URL;
    let status,body;
    await api({url:'/api/index?route=login',method:'POST',headers:{}},{writeHead:s=>status=s,end:s=>body=JSON.parse(s)});
    assert.equal(status,503);assert.equal(body.code,'CONFIG_MISSING');assert.match(body.error,/SUPABASE_URL/);
    assert.ok(!JSON.stringify(body).includes(complete.ADMIN_PASSWORD));
  } finally {for(const name of Object.keys(process.env))if(!(name in original))delete process.env[name];Object.assign(process.env,original);}
});

for (const [status,providerCode,expected] of [[401,'invalid','SUPABASE_KEY_REJECTED'],[404,'PGRST202','SUPABASE_SCHEMA_MISSING'],[404,'PGRST205','SUPABASE_SCHEMA_MISSING'],[403,'42501','SUPABASE_PERMISSION_DENIED']]) {
  test(`Supabase : ${status}/${providerCode} produit le diagnostic ${expected}`, async () => {
    const store=createSupabaseStore({url:complete.SUPABASE_URL,key:complete.SUPABASE_SERVICE_ROLE_KEY,fetcher:async()=>new Response(JSON.stringify({code:providerCode,message:'private-provider-response'}),{status})});
    await assert.rejects(()=>store.allowLogin('test-ip'),e=>e.code===expected&&e.status===503&&!e.message.includes('private-provider-response')&&!e.message.includes(complete.SUPABASE_SERVICE_ROLE_KEY));
  });
}
