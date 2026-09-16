// Self-check: plugin config round-trip, secret masking, id traversal guard.
// Run: node test/plugins-config.test.mjs
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '../lib/plugins.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = '_cfgtest';
const dir = join(ROOT, 'plugins', id);
const MASK = '•'.repeat(8);

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'server-manager-plugin.json'), JSON.stringify({
  id, name: 'T', env: [
    { key: 'A_ID', label: 'ID', required: true },
    { key: 'A_SECRET', label: 'Secret', required: true, secret: true },
  ],
}));

try {
  assert.equal(p.status(id).state, 'needs-config');

  p.setConfig(id, { A_ID: 'me@x.com', A_SECRET: 'hunter2' });
  assert.equal(p.status(id).state, 'connected');

  const c = p.getConfig(id);
  assert.equal(c.env.find(f => f.key === 'A_ID').value, 'me@x.com');
  assert.equal(c.env.find(f => f.key === 'A_SECRET').value, MASK);

  // Re-submitting the mask must not clobber the stored secret.
  p.setConfig(id, { A_ID: 'new@x.com', A_SECRET: MASK });
  const env = readFileSync(join(dir, '.env'), 'utf8');
  assert.match(env, /A_SECRET=hunter2/);
  assert.match(env, /A_ID=new@x\.com/);

  // Path traversal in the instance id is rejected.
  assert.throws(() => p.getConfig('../../etc'));
  assert.equal(p.status('../../etc').state, 'error');

  console.log('OK');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
