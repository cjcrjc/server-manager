import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const REGISTRY_PATH = join(ROOT, 'registry', 'registry.json');

function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { plugins: [] };
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
}

export function listInstalled() {
  const dirs = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());
  return dirs.map(d => {
    const manifestPath = join(PLUGINS_DIR, d.name, 'server-manager-plugin.json');
    if (!existsSync(manifestPath)) return { id: d.name, name: d.name, error: 'Missing manifest' };
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  });
}

export async function install(repoUrl, id) {
  const dest = join(PLUGINS_DIR, id);
  if (existsSync(dest)) throw new Error(`Plugin ${id} already installed`);

  // Clone
  await exec('git', ['clone', '--depth=1', repoUrl, dest]);

  // Read manifest
  const manifestPath = join(dest, 'server-manager-plugin.json');
  if (!existsSync(manifestPath)) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error('Repo missing server-manager-plugin.json manifest');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // Install deps if specified
  if (manifest.install) {
    const [cmd, ...args] = manifest.install.split(/\s+/);
    await exec(cmd, args, { cwd: dest });
  }

  return manifest;
}

export function remove(id) {
  const dest = join(PLUGINS_DIR, id);
  if (!existsSync(dest)) throw new Error(`Plugin ${id} not found`);
  rmSync(dest, { recursive: true, force: true });
}
