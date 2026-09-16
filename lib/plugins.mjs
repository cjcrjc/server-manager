import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLUGINS_DIR = join(ROOT, 'plugins');
const REGISTRY_PATH = join(ROOT, 'registry', 'registry.json');
const TEMPLATES_DIR = join(ROOT, 'templates', 'mcp');

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
    .filter(d => d.isDirectory() && d.name !== '.gitkeep');
  return dirs.map(d => {
    const manifestPath = join(PLUGINS_DIR, d.name, 'server-manager-plugin.json');
    if (!existsSync(manifestPath)) return { id: d.name, name: d.name, error: 'Missing manifest', _dir: d.name };
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest._dir = d.name;
    return manifest;
  });
}

/** Install from template, npm package, git URL, or local path */
export async function install(source, id) {
  const dest = join(PLUGINS_DIR, id);
  if (existsSync(dest)) throw new Error(`Plugin "${id}" already installed`);
  mkdirSync(dest, { recursive: true });

  if (source.startsWith('template:')) {
    const tplName = source.slice('template:'.length);
    const tplPath = join(TEMPLATES_DIR, tplName);
    if (!existsSync(tplPath)) {
      rmSync(dest, { recursive: true, force: true });
      throw new Error(`Template "${tplName}" not found at ${tplPath}`);
    }
    cpSync(tplPath, dest, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.includes('.git'),
    });
  } else if (source.startsWith('npm:')) {
    const pkg = source.slice(4);
    await exec('npm', ['init', '-y'], { cwd: dest });
    await exec('npm', ['install', pkg], { cwd: dest });
  } else if (source.startsWith('http://') || source.startsWith('https://') || source.endsWith('.git')) {
    rmSync(dest, { recursive: true, force: true });
    await exec('git', ['clone', '--depth=1', source, dest]);
    rmSync(join(dest, '.git'), { recursive: true, force: true });
  } else {
    const absSource = resolve(source);
    if (existsSync(absSource) && existsSync(join(absSource, 'package.json'))) {
      cpSync(absSource, dest, {
        recursive: true,
        filter: (src) => !src.includes('node_modules') && !src.includes('.git'),
      });
    } else {
      rmSync(dest, { recursive: true, force: true });
      throw new Error(`Invalid source: ${source}`);
    }
  }

  // Read or auto-generate manifest
  const manifestPath = join(dest, 'server-manager-plugin.json');
  let manifest;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } else {
    const pkgPath = join(dest, 'package.json');
    if (!existsSync(pkgPath)) {
      rmSync(dest, { recursive: true, force: true });
      throw new Error('No server-manager-plugin.json or package.json found in source');
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    // Sources without their own manifest (npm/git) borrow the registry entry's
    // field spec so the Configure form is not empty.
    const entry = (loadRegistry().plugins || []).find(p => p.source === source) || {};
    manifest = {
      id,
      name: entry.name || pkg.name || id,
      description: entry.description || pkg.description || '',
      version: pkg.version || '1.0.0',
      type: 'mcp-stdio',
      entry: pkg.main || 'server.mjs',
      install: 'npm install',
      env: entry.env || [],
      tags: entry.tags || [],
      claude_config: {
        command: 'node',
        args: [pkg.main || 'server.mjs'],
      },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  // Install production dependencies if needed
  if (existsSync(join(dest, 'package.json')) && !existsSync(join(dest, 'node_modules'))) {
    try {
      await exec('npm', ['install', '--production'], { cwd: dest });
    } catch (err) {
      console.warn(`npm install warning for ${id}:`, err.message);
    }
  }

  manifest._dir = id;
  return manifest;
}

function pluginDir(id) {
  if (!/^[a-zA-Z0-9._-]+$/.test(id) || id.startsWith('.')) throw new Error(`Invalid plugin id: ${id}`);
  return join(PLUGINS_DIR, id);
}

function envPath(id) {
  const dest = pluginDir(id);
  if (!existsSync(dest)) throw new Error(`Plugin ${id} not found`);
  return join(dest, '.env');
}

function manifestOf(id) {
  const p = join(pluginDir(id), 'server-manager-plugin.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { env: [] };
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["'](.*)["']$/, '$1');
  }
  return out;
}

/** Config for one instance; secret values masked. */
export function getConfig(id) {
  const p = envPath(id);
  const values = existsSync(p) ? parseEnv(readFileSync(p, 'utf8')) : {};
  const spec = manifestOf(id).env || [];
  return {
    env: spec.map(f => ({
      ...f,
      value: f.secret && values[f.key] ? '••••••••' : (values[f.key] ?? ''),
      set: Boolean(values[f.key]),
    })),
  };
}

/** Merge updates into .env. Masked/empty secrets are left untouched. */
export function setConfig(id, updates) {
  const p = envPath(id);
  const current = existsSync(p) ? parseEnv(readFileSync(p, 'utf8')) : {};
  const spec = manifestOf(id).env || [];
  const secrets = new Set(spec.filter(f => f.secret).map(f => f.key));
  for (const [k, v] of Object.entries(updates)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    if (secrets.has(k) && (v === '' || v === '••••••••')) continue;
    current[k] = String(v).replace(/[\r\n]/g, '');
  }
  const body = Object.entries(current).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  writeFileSync(p, body, { mode: 0o600 });
  return status(id);
}

/** connected | needs-config | error */
export function status(id) {
  let dir;
  try { dir = pluginDir(id); } catch { return { id, state: 'error', detail: 'Invalid id' }; }
  if (!existsSync(dir)) return { id, state: 'error', detail: 'Not installed' };
  const spec = manifestOf(id).env || [];
  const values = existsSync(join(dir, '.env')) ? parseEnv(readFileSync(join(dir, '.env'), 'utf8')) : {};
  const required = spec.filter(f => f.required);
  const missing = required.filter(f => !values[f.key]).map(f => f.key);
  if (missing.length) return { id, state: 'needs-config', detail: `Missing: ${missing.join(', ')}` };
  // No required fields declared: treat any set value as configured.
  if (!required.length && spec.length && !spec.some(f => values[f.key]))
    return { id, state: 'needs-config', detail: 'No credentials entered' };
  return { id, state: 'connected', detail: 'Credentials present' };
}

/** mcpServers block for MCP clients (Claude Code, Paseo), env inlined from each .env */
export function mcpConfig() {
  const servers = {};
  for (const m of listInstalled()) {
    const dir = m._dir;
    const cfg = m.claude_config || { command: 'node', args: [m.entry || 'server.mjs'] };
    const envFile = join(pluginDir(dir), '.env');
    const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
    servers[dir] = {
      type: 'stdio',
      command: cfg.command,
      args: (cfg.args || []).map(a => (a.endsWith('.mjs') || a.endsWith('.js') ? join(pluginDir(dir), a) : a)),
      env,
    };
  }
  return { mcpServers: servers };
}

export function statusAll() {
  return listInstalled().map(p => status(p._dir));
}

export function remove(id) {
  const dest = join(PLUGINS_DIR, id);
  if (!existsSync(dest)) throw new Error(`Plugin ${id} not found`);
  rmSync(dest, { recursive: true, force: true });
}
