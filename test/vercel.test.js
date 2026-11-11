import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('Le point d’entrée Vercel renvoie 503 si sa configuration manque, sans planter', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
    import api from './api/index.js';
    const req = { url: '/api/products', method: 'GET', headers: {} };
    let status;
    await api(req, {
      writeHead(code) { status = code; },
      end(body) { console.log(JSON.stringify({ status, body: JSON.parse(body) })); }
    });
  `], { env: { ...process.env, VERCEL: '1', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', ADMIN_PASSWORD: '' } });
  const response = JSON.parse(stdout);
  assert.equal(response.status, 503);
  assert.match(response.body.error, /configuration/);
});
