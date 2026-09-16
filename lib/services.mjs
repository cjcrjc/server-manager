import { execFile } from 'node:child_process';

const cache = new Map();
const CACHE_TTL = 5000;

function run(cmd, args, timeout = 3000) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout || '').trim() });
    });
  });
}

export async function checkService(unit, type = 'user') {
  const key = `${type}:${unit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.value;

  const args = type === 'user'
    ? ['--user', 'is-active', unit]
    : ['is-active', unit];
  const { ok, stdout } = await run('systemctl', args);
  const active = stdout === 'active';
  cache.set(key, { time: Date.now(), value: active });
  return active;
}

export async function restartService(unit, type = 'user') {
  const args = type === 'user'
    ? ['--user', 'restart', unit]
    : ['restart', unit];
  const { ok } = await run('systemctl', args, 10000);
  // Bust cache
  cache.delete(`${type}:${unit}`);
  return ok;
}

export async function checkAll(services) {
  const results = await Promise.all(
    services.map(async s => ({
      ...s,
      active: await checkService(s.unit, s.type || 'user'),
    }))
  );
  return results;
}
