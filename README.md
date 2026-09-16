# Server Manager

Lightweight server manager dashboard for agentic Linux servers. Monitors systemd services, manages MCP plugins, and provides a web-based control panel — all accessible over Tailscale.

## Features

- **Service Health Dashboard** — Live status of all configured systemd services
- **Plugin System** — Install/remove MCP servers from a curated registry or any git repo
- **Dependency Checker** — Verify core services (Tailscale, 9Router, Paseo) are running
- **Bootstrap Script** — One-command setup for new installations

## Quick Start

```bash
git clone <repo-url> ~/server-manager
cd ~/server-manager
./setup.sh
```

## Manual Setup

```bash
cp config.example.json config.json
# Edit config.json with your services
node server.mjs
```

## Architecture

- **Backend:** Node.js stdlib (`node:http`), zero dependencies
- **Frontend:** Vanilla HTML/CSS/JS, no build step
- **Plugins:** Git repos with `server-manager-plugin.json` manifest
- **Monitoring:** `systemctl` health checks with 5-second cache

## Plugin Format

Each MCP plugin repo contains a `server-manager-plugin.json`:

```json
{
  "id": "my-mcp",
  "name": "My MCP Server",
  "description": "What it does",
  "version": "1.0.0",
  "type": "mcp-stdio",
  "entry": "server.mjs",
  "install": "npm install",
  "env": [],
  "tags": [],
  "claude_config": {
    "command": "node",
    "args": ["server.mjs"]
  }
}
```

## Requirements

- Node.js >= 20
- Linux with systemd
- Tailscale (for remote access)
