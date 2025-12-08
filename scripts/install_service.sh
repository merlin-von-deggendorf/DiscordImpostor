#!/usr/bin/env bash
set -euo pipefail

# Installs the Discord Impostor bot as a systemd service on Debian.
# Safe to re-run; will update deps and restart the service.

APP_USER="${APP_USER:-root}"
APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-/etc/discord-impostor.env}"
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

echo "[1/6] Installing system packages (nodejs, npm, git)..."
apt-get update -y
apt-get install -y nodejs npm git ca-certificates

if [[ "${APP_USER}" != "root" ]]; then
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    echo "[2/6] Creating service user ${APP_USER}..."
    useradd --system --create-home --shell /usr/sbin/nologin "${APP_USER}"
  else
    echo "[2/6] Service user ${APP_USER} already exists."
  fi
else
  echo "[2/6] Using root as the service user."
fi

echo "[3/6] Installing node modules with npm ci..."
if [[ "${APP_USER}" != "root" ]]; then
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
  sudo -u "${APP_USER}" npm ci --prefix "${APP_DIR}"
else
  npm ci --prefix "${APP_DIR}"
fi

echo "[4/6] Installing environment file to ${ENV_FILE}..."
if [[ -f "${APP_DIR}/.env" ]]; then
  install -o "${APP_USER}" -g "${APP_USER}" -m 640 "${APP_DIR}/.env" "${ENV_FILE}"
  echo "Copied existing .env to ${ENV_FILE}."
else
  touch "${ENV_FILE}"
  chmod 640 "${ENV_FILE}"
  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  echo "Created empty ${ENV_FILE}; populate it with your secrets."
fi

echo "[5/6] Writing systemd unit to ${SERVICE_FILE}..."
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Discord Impostor Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/npm start --prefix ${APP_DIR}
Restart=always
RestartSec=5
TimeoutStartSec=30
# Hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo "[6/6] Enabling and starting service ${SERVICE_NAME}..."
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"

systemctl status "${SERVICE_NAME}.service" --no-pager -n 20
echo "Done. The bot should now restart on crashes and server reboots."
