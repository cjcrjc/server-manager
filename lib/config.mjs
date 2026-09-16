import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_PATH = join(ROOT, 'config.json');
const EXAMPLE_PATH = join(ROOT, 'config.example.json');

let _cache = null;
let _mtime = 0;

export function load() {
  if (!existsSync(CONFIG_PATH)) {
    if (existsSync(EXAMPLE_PATH)) {
      writeFileSync(CONFIG_PATH, readFileSync(EXAMPLE_PATH));
    } else {
      throw new Error('No config.json or config.example.json found');
    }
  }
  const stat = JSON.parse(JSON.stringify({ mtimeMs: Date.now() })); // cheap: just reload every time for now
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  _cache = JSON.parse(raw);
  return _cache;
}

export function save(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  _cache = config;
}

export function get() {
  return _cache || load();
}
