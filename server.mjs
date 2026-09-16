import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as config from './lib/config.mjs';
import * as services from './lib/services.mjs';
import * as deps from './lib/deps.mjs';
import * as plugins from './lib/plugins.mjs';
import * as ninerouter from './lib/ninerouter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveStatic(res, urlPath) {
  const filePath = join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(PUBLIC)) return notFound(res);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) return notFound(res);
  const mime = MIME[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(filePath));
}

function notFound(res) {
  json(res, { error: 'Not found' }, 404);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : {};
}

function match(method, url, pattern) {
  if (method !== pattern[0]) return null;
  const parts = url.split('/').filter(Boolean);
  const patParts = pattern[1].split('/').filter(Boolean);
  if (parts.length !== patParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = decodeURIComponent(parts[i]);
    } else if (patParts[i] !== parts[i]) {
      return null;
    }
  }
  return params;
}

async function handleAPI(req, res, url) {
  const method = req.method;
  let params;

  // GET /api/status
  if (method === 'GET' && url === '/api/status') {
    const cfg = config.get();
    const [svcStatus, depStatus] = await Promise.all([
      services.checkAll(cfg.services || []),
      deps.checkAll(cfg.deps || {}),
    ]);
    return json(res, {
      hostname: cfg.hostname,
      services: svcStatus,
      deps: depStatus,
      plugins: plugins.listInstalled(),
    });
  }

  // GET /api/services
  if (method === 'GET' && url === '/api/services') {
    const cfg = config.get();
    const svcStatus = await services.checkAll(cfg.services || []);
    return json(res, svcStatus);
  }

  // POST /api/services/:unit/restart
  if ((params = match(method, url, ['POST', '/api/services/:unit/restart']))) {
    const ok = await services.restartService(params.unit);
    return json(res, { ok, unit: params.unit });
  }

  // GET /api/plugins
  if (method === 'GET' && url === '/api/plugins') {
    return json(res, plugins.listInstalled());
  }

  // GET /api/plugins/registry
  if (method === 'GET' && url === '/api/plugins/registry') {
    return json(res, plugins.loadRegistry());
  }

  // POST /api/plugins/install
  if (method === 'POST' && url === '/api/plugins/install') {
    try {
      const body = await readBody(req);
      if (!body.source || !body.id) return json(res, { error: 'source and id required' }, 400);
      const manifest = await plugins.install(body.source, body.id);
      return json(res, { ok: true, manifest });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // POST /api/plugins/:id/remove
  if ((params = match(method, url, ['POST', '/api/plugins/:id/remove']))) {
    try {
      plugins.remove(params.id);
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /api/deps
  if (method === 'GET' && url === '/api/deps') {
    const cfg = config.get();
    const depStatus = await deps.checkAll(cfg.deps || {});
    return json(res, depStatus);
  }

  // POST /api/deps/:name/fix
  if ((params = match(method, url, ['POST', '/api/deps/:name/fix']))) {
    const cfg = config.get();
    const dep = cfg.deps?.[params.name];
    if (!dep) return json(res, { error: 'Unknown dependency' }, 404);
    const result = await deps.fixDep(dep);
    return json(res, { name: params.name, ...result });
  }

  // GET /api/config
  if (method === 'GET' && url === '/api/config') {
    const cfg = config.get();
    return json(res, { hostname: cfg.hostname, port: cfg.port, serviceCount: cfg.services?.length });
  }

  // ── 9Router API ──

  // GET /api/9router/combos
  if (method === 'GET' && url === '/api/9router/combos') {
    try {
      const [combos, models, policyState] = await Promise.all([
        ninerouter.getCombos(),
        ninerouter.getModels(),
        Promise.resolve(ninerouter.getQuotaPolicyState()),
      ]);
      return json(res, { combos, models, policyState });
    } catch (e) {
      return json(res, { error: e.message }, 502);
    }
  }

  // GET /api/9router/connections
  if (method === 'GET' && url === '/api/9router/connections') {
    try {
      const conns = await ninerouter.getConnections();
      return json(res, conns);
    } catch (e) {
      return json(res, { error: e.message }, 502);
    }
  }

  // PUT /api/9router/combos/:id
  if ((params = match(method, url, ['PUT', '/api/9router/combos/:id']))) {
    try {
      const body = await readBody(req);
      if (!Array.isArray(body.models)) return json(res, { error: 'models array required' }, 400);
      await ninerouter.updateCombo(params.id, body.models);
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, 502);
    }
  }

  // POST /api/9router/combos
  if (method === 'POST' && url === '/api/9router/combos') {
    try {
      const body = await readBody(req);
      if (!body.name || !Array.isArray(body.models)) {
        return json(res, { error: 'name and models[] required' }, 400);
      }
      const result = await ninerouter.createCombo(body.name, body.models);
      return json(res, { ok: true, combo: result });
    } catch (e) {
      return json(res, { error: e.message }, 502);
    }
  }

  // DELETE /api/9router/combos/:id
  if ((params = match(method, url, ['DELETE', '/api/9router/combos/:id']))) {
    try {
      await ninerouter.deleteCombo(params.id);
      return json(res, { ok: true });
    } catch (e) {
      return json(res, { error: e.message }, 502);
    }
  }

  notFound(res);
}

const cfg = config.load();
const PORT = cfg.port || 18080;

const server = createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url.startsWith('/api/')) {
      await handleAPI(req, res, url);
    } else {
      serveStatic(res, url);
    }
  } catch (e) {
    console.error(e);
    json(res, { error: 'Internal server error' }, 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server manager listening on http://127.0.0.1:${PORT}`);
});
