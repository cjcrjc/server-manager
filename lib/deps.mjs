import { execFile } from 'node:child_process';

function run(cmd, timeout = 5000) {
  const [bin, ...args] = cmd.split(/\s+/);
  return new Promise(resolve => {
    execFile(bin, args, { timeout }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout || '').trim() });
    });
  });
}

export async function checkDep(name, dep) {
  const { ok, stdout } = await run(dep.check);
  return { name, ok, output: stdout, canFix: !!dep.fix };
}

export async function fixDep(dep) {
  if (!dep.fix) return { ok: false, reason: 'No auto-fix available' };
  const { ok } = await run(dep.fix, 10000);
  return { ok };
}

export async function checkAll(deps) {
  const entries = Object.entries(deps);
  return Promise.all(entries.map(([name, dep]) => checkDep(name, dep)));
}
