# Server Manager

Lightweight Node.js server manager dashboard. Zero npm dependencies — uses only Node stdlib.

## Structure
- `server.mjs` — HTTP server, static file serving, API routing
- `lib/` — Backend modules (services, plugins, deps, config)
- `public/` — Vanilla HTML/CSS/JS frontend (no build step)
- `plugins/` — Installed MCP plugins (gitignored)
- `registry/` — Curated plugin registry
- `config.json` — Installation-specific config (gitignored, copy from config.example.json)

## Conventions
- ESM throughout (`"type": "module"`)
- No npm dependencies for core server
- Shell out to `systemctl` for service health (not dbus)
- 5-second cache on health checks
- Plugin manifest file: `server-manager-plugin.json`
