# Server Manager

Lightweight server manager dashboard for agentic Linux servers. Monitors systemd services, manages MCP plugins, configures 9Router LLM routing tiers, and provides a web-based control panel — all accessible over Tailscale.

## Zero-Dependency Bootstrap (Fresh Machine)

You can clone this repo onto a completely fresh Ubuntu installation with nothing else installed, run the bootstrap, and manage everything from the web UI:

```bash
git clone https://github.com/cjcrjc/server-manager.git ~/server-manager
cd ~/server-manager
./setup.sh
```

`setup.sh` automatically:
1. Installs system packages (`curl`, `git`, `build-essential`) if missing.
2. Installs Node.js 20 LTS if missing or outdated.
3. Installs `9router` and `@getpaseo/cli` globally.
4. Generates dynamic user-level systemd services for `9router`, `paseo`, and `server-manager`.
5. Installs Tailscale if missing and reminds you to authenticate.
6. Starts the server manager on port `18080` (and `0.0.0.0` for LAN access).

## Features

- **Service Health Dashboard**: Live status of all configured user and system services with one-click restart.
- **Dependency Checker & Self-Healing**: Detects missing tools (Node, Tailscale, 9Router, Paseo) with direct "Fix / Start" or "Install" buttons directly in the UI.
- **Built-in Bundled MCP Registry**: Comes with pre-bundled templates for:
  - **Google Workspace** (`template:google`): Calendar, Gmail, Drive, Docs.
  - **iCloud** (`template:icloud`): Calendars & Reminders via CalDAV.
  - **Waterloo LEARN (D2L)** (`template:d2l`): Courses, assignments, announcements.
  - **Microsoft OneDrive** (`npm:ms-onedrive-mcp`): Multi-account OneDrive files.
  - Custom git URLs, local paths, or any `npm:<package>` name.
- **Multi-Instance / Multi-Account MCPs**: Install multiple isolated instances of the same MCP (e.g. `onedrive-personal`, `onedrive-work`, `icloud-cam`).
- **9Router Tier Visual Editor**:
  - Drag-and-drop model reordering across arbitrary complexity tiers (`quota-simple`, `quota-smart`, `quota-complex`, or custom).
  - Drag unassigned models directly from the available provider pool.
  - Real-time provider connection & account priority monitoring.
  - Graceful degradation: if 9Router is not yet installed or configured, the UI explains how to set it up without crashing.

## Claude Desktop / Code Integration

Installed MCP plugins can be added to your Claude settings (`~/.claude.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "onedrive-personal": {
      "command": "node",
      "args": ["/home/YOUR_USER/server-manager/plugins/onedrive-personal/server.mjs"]
    }
  }
}
```
