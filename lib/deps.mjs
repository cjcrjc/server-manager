import { execFile, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

function runFile(cmd, timeout = 5000) {
  const [bin, ...args] = cmd.split(/\s+/);
  return new Promise(resolve => {
    execFile(bin, args, { timeout }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout || '').trim() });
    });
  });
}

export async function checkDep(name, dep) {
  const { ok, stdout } = await runFile(dep.check);
  return { name, ok, output: stdout, canFix: !!dep.fix, install: dep.install || null };
}

export async function fixDep(dep) {
  const cmd = dep.fix || dep.install;
  if (!cmd) return { ok: false, reason: 'No auto-fix available' };
  try {
    const { stdout } = await execAsync(cmd, { timeout: 120000 });
    return { ok: true, output: stdout };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

export async function checkAll(deps) {
  const entries = Object.entries(deps);
  return Promise.all(entries.map(([name, dep]) => checkDep(name, dep)));
}
