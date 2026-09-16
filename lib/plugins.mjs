import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
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
  if (!existsSync(PLUGINS_DIR)) return [];
  const dirs = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());
  return dirs.map(d => {
    const manifestPath = join(PLUGINS_DIR, d.name, 'server-manager-plugin.json');
    if (!existsSync(manifestPath)) return { id: d.name, name: d.name, error: 'Missing manifest' };
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest._dir = d.name;
    return manifest;
  });
}

/** Install from git URL, local path, or npm package */
export async function install(source, id) {
  const dest = join(PLUGINS_DIR, id);
  if (existsSync(dest)) throw new Error(`Plugin "${id}" already installed`);
  mkdirSync(dest, { recursive: true });

  const absSource = resolve(source);
  if (existsSync(absSource) && existsSync(join(absSource, 'package.json'))) {
    // Local directory — copy files (skip node_modules/.git)
    cpSync(absSource, dest, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.includes('.git'),
    });
  } else if (source.startsWith('npm:')) {
    // npm package — install into dest
    const pkg = source.slice(4);
    await exec('npm', ['init', '-y'], { cwd: dest });
    await exec('npm', ['install', pkg], { cwd: dest });
  } else {
    // Git URL
    rmSync(dest, { recursive: true, force: true });
    await exec('git', ['clone', '--depth=1', source, dest]);
    // Remove .git dir — this is an install, not a dev checkout
    rmSync(join(dest, '.git'), { recursive: true, force: true });
  }

  // Read or generate manifest
  const manifestPath = join(dest, 'server-manager-plugin.json');
  let manifest;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } else {
    // Auto-generate from package.json
    const pkgPath = join(dest, 'package.json');
    if (!existsSync(pkgPath)) {
      rmSync(dest, { recursive: true, force: true });
      throw new Error('No server-manager-plugin.json or package.json found');
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    manifest = {
      id,
      name: pkg.name || id,
      description: pkg.description || '',
      version: pkg.version || '0.0.0',
      type: 'mcp-stdio',
      entry: pkg.main || 'server.mjs',
      install: 'npm install',
      env: [],
      tags: [],
      claude_config: {
        command: 'node',
        args: [pkg.main || 'server.mjs'],
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  // Run install command if deps needed
  if (existsSync(join(dest, 'package.json')) && !existsSync(join(dest, 'node_modules'))) {
    await exec('npm', ['install', '--production'], { cwd: dest });
  }

  return manifest;
}

export function remove(id) {
  const dest = join(PLUGINS_DIR, id);
  if (!existsSync(dest)) throw new Error(`Plugin ${id} not found`);
  rmSync(dest, { recursive: true, force: true });
}
