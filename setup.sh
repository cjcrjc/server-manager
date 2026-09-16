#!/bin/bash
set -euo pipefail

echo "=== Server Manager Setup ==="
echo

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 1. Check Node.js
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Install Node.js >= 20 first."
  echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "   sudo apt-get install -y nodejs"
  exit 1
fi

NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_VER" -lt 20 ]; then
  echo "❌ Node.js >= 20 required (found v$(node -v))"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# 2. Config
if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "✓ Created config.json from template"
  echo "  → Edit config.json to customize services"
else
  echo "✓ config.json exists"
fi

# 3. Systemd user service
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

cp systemd/server-manager.service "$SYSTEMD_DIR/server-manager.service"
systemctl --user daemon-reload
echo "✓ Installed systemd user service"

# 4. Disable old nav-landing if present
if systemctl --user is-enabled nav-landing.service &>/dev/null; then
  systemctl --user stop nav-landing.service || true
  systemctl --user disable nav-landing.service || true
  echo "✓ Disabled old nav-landing.service"
fi

# 5. Enable and start
systemctl --user enable server-manager.service
systemctl --user restart server-manager.service
echo "✓ Started server-manager.service"

# 6. Check Tailscale serve
if command -v tailscale &>/dev/null; then
  SERVE_STATUS=$(tailscale serve status 2>&1 || true)
  if echo "$SERVE_STATUS" | grep -q "18080"; then
    echo "✓ Tailscale serve already proxying :18080"
  else
    echo "ℹ  Configure Tailscale serve:"
    echo "   sudo tailscale serve --bg http://127.0.0.1:18080"
  fi
else
  echo "⚠ Tailscale not found — install for remote access"
fi

echo
echo "=== Setup complete ==="
echo "Local:  http://127.0.0.1:18080"
echo "Remote: http://$(hostname)/ (via Tailscale)"
