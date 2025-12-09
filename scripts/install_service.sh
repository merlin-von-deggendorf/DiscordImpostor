#!/usr/bin/env bash
set -euo pipefail

# Minimal installer: just drop a systemd unit that runs `npm start` in this repo.

APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
SERVICE_NAME="discord-impostor"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ $EUID -ne 0 ]]; then
  echo "Run this script as root (use sudo)." >&2
  exit 1
fi

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "APP_DIR=${APP_DIR} does not look like the bot project (missing package.json)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js/npm first." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  touch "${ENV_FILE}"
  echo "Created ${ENV_FILE} (add DISCORD_TOKEN and other secrets as needed)."
fi

echo "Writing systemd unit to ${SERVICE_FILE}..."
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Discord Impostor Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/env npm start --prefix ${APP_DIR}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Reloading systemd and enabling ${SERVICE_NAME}..."
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"

systemctl status "${SERVICE_NAME}.service" --no-pager -n 20 || true
echo "Done. Edit ${ENV_FILE} for secrets and run 'systemctl restart ${SERVICE_NAME}' after changes."
