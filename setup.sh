#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "    Agentic Linux Server Bootstrap"
echo "=========================================="
echo

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 1. System packages
echo "[1/6] Checking system tools..."
MISSING_PKGS=""
for pkg in curl git build-essential; do
  if ! command -v "$pkg" &>/dev/null; then
    MISSING_PKGS="$MISSING_PKGS $pkg"
  fi
done
if [ -n "$MISSING_PKGS" ]; then
  echo "Installing missing packages:$MISSING_PKGS"
  sudo apt-get update -qq && sudo apt-get install -y -qq $MISSING_PKGS
fi
echo "✓ System tools ready"

# 2. Node.js >= 20
echo "[2/6] Checking Node.js..."
NEED_NODE=0
if ! command -v node &>/dev/null; then
  NEED_NODE=1
else
  NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
  if [ "$NODE_VER" -lt 20 ]; then
    NEED_NODE=1
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  echo "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "✓ Node.js $(node -v) ready"

# 3. Core dependencies: 9router & paseo CLI
echo "[3/6] Checking 9router & Paseo..."
if ! command -v 9router &>/dev/null; then
  echo "Installing 9router globally..."
  sudo npm install -g 9router || npm install -g 9router
fi
echo "✓ 9router ready"

if ! command -v paseo &>/dev/null; then
  echo "Installing @getpaseo/cli globally..."
  sudo npm install -g @getpaseo/cli || npm install -g @getpaseo/cli
fi
echo "✓ Paseo CLI ready"

# 4. Config & Service template
echo "[4/6] Setting up config..."
if [ ! -f config.json ]; then
  cp config.example.json config.json
  echo "✓ Created config.json from template"
else
  echo "✓ config.json already exists"
fi

# 5. Systemd user services
echo "[5/6] Configuring systemd user services..."
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

# Server Manager
cp systemd/server-manager.service "$SYSTEMD_DIR/server-manager.service"

# 9router service template (if missing)
if [ ! -f "$SYSTEMD_DIR/9router.service" ]; then
  cat << 'EOF' > "$SYSTEMD_DIR/9router.service"
[Unit]
Description=9Router LLM gateway
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=%h
Environment="PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/env 9router --tray --skip-update -p 20128
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
  echo "✓ Generated 9router.service"
fi

# Paseo service template (if missing)
if [ ! -f "$SYSTEMD_DIR/paseo.service" ]; then
  cat << 'EOF' > "$SYSTEMD_DIR/paseo.service"
[Unit]
Description=Paseo Agent Daemon
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=%h
Environment="PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin"
Environment="PASEO_HOME=%h/.paseo"
ExecStart=/usr/bin/env paseo start --foreground --home %h/.paseo --listen 127.0.0.1:6767 --no-relay
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
  echo "✓ Generated paseo.service"
fi

systemctl --user daemon-reload

# Enable & start server-manager
systemctl --user enable server-manager.service
systemctl --user restart server-manager.service
echo "✓ Started server-manager.service"

# 6. Tailscale setup
echo "[6/6] Checking Tailscale..."
if ! command -v tailscale &>/dev/null; then
  echo "Tailscale not found. Installing..."
  curl -fsSL https://tailscale.com/install.sh | sh
  echo "Please authenticate Tailscale:"
  echo "  sudo tailscale up"
else
  echo "✓ Tailscale installed"
  # Check if serve is active
  if sudo tailscale serve status 2>&1 | grep -q "18080"; then
    echo "✓ Tailscale serve proxying :18080"
  else
    echo "ℹ  To expose the manager dashboard over Tailscale on port 80/443:"
    echo "   sudo tailscale serve --bg http://127.0.0.1:18080"
  fi
fi

echo
echo "=========================================="
echo "✓ Setup complete!"
echo "Dashboard running at: http://127.0.0.1:18080"
echo "Tailscale URL:        http://$(hostname)/"
echo "=========================================="
