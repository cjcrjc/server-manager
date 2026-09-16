/**
 * 9Router API proxy — reads combos, models, connections, and quota from
 * the local 9Router instance. Authenticates via JWT using the shared secret.
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { request } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DATA = join(homedir(), '.9router');
const JWT_SECRET_PATH = join(DATA, 'jwt-secret');
const DB_PATH = join(DATA, 'db', 'data.sqlite');
const BASE = 'http://127.0.0.1:20128';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function authCookie() {
  const secret = readFileSync(JWT_SECRET_PATH, 'utf8').trim();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256' }));
  const payload = b64url(JSON.stringify({ authenticated: true, iat: now, exp: now + 300 }));
  const input = `${header}.${payload}`;
  const sig = b64url(createHmac('sha256', secret).update(input).digest());
  return `auth_token=${input}.${sig}`;
}

function apiCall(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        Cookie: authCookie(),
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    };
    const req = request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('9router API timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** List all combos (tiers) */
export async function getCombos() {
  const data = await apiCall('/api/combos');
  return data.combos || [];
}

/** Get all available models */
export async function getModels() {
  const data = await apiCall('/v1/models');
  return (data.data || []).map(m => m.id);
}

/** Get provider connections from 9router's SQLite DB */
export async function getConnections() {
  // Dynamic import to avoid top-level await issues
  const { default: Database } = await import(join(DATA, 'runtime', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'));
  const SQL = await Database();
  const buf = readFileSync(DB_PATH);
  const db = new SQL.Database(buf);
  const rows = db.exec(
    `SELECT id, provider, name, email, isActive, priority
     FROM providerConnections ORDER BY provider, priority`
  );
  db.close();
  if (!rows.length) return [];
  return rows[0].values.map(([id, provider, name, email, isActive, priority]) => ({
    id, provider, name, email, active: !!isActive, priority,
  }));
}

/** Get quota/usage for a connection */
export async function getUsage(connectionId) {
  return apiCall(`/api/usage/${connectionId}`);
}

/** Update a combo's model list */
export async function updateCombo(comboId, models) {
  const combos = await getCombos();
  const combo = combos.find(c => c.id === comboId);
  if (!combo) throw new Error(`Combo ${comboId} not found`);
  return apiCall(`/api/combos/${comboId}`, 'PUT', {
    name: combo.name,
    models,
    kind: combo.kind || 'llm',
  });
}

/** Create a new combo (tier) */
export async function createCombo(name, models) {
  return apiCall('/api/combos', 'POST', {
    name,
    models,
    kind: 'llm',
  });
}

/** Delete a combo */
export async function deleteCombo(comboId) {
  return apiCall(`/api/combos/${comboId}`, 'DELETE');
}

/** Set fallback strategy for combos */
export async function setFallbackStrategy(comboNames) {
  const settings = await apiCall('/api/settings');
  const strategies = { ...(settings.comboStrategies || {}) };
  for (const name of comboNames) {
    strategies[name] = { fallbackStrategy: 'fallback' };
  }
  return apiCall('/api/settings', 'PATCH', { comboStrategies: strategies });
}

/** Get current quota policy state */
export function getQuotaPolicyState() {
  try {
    const raw = readFileSync(join(DATA, 'quota-policy-state.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
