#!/usr/bin/env bash
set -euo pipefail

# Enables the service, pulls latest code, and restarts the bot.

SERVICE_NAME="${SERVICE_NAME:-discord-impostor}"
REPO_DIR="${REPO_DIR:-$(pwd)}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this script as root (use sudo)." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not found." >&2
  exit 1
fi

if [[ ! -d "${REPO_DIR}" ]]; then
  echo "REPO_DIR=${REPO_DIR} does not exist." >&2
  exit 1
fi

if ! git -C "${REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "REPO_DIR=${REPO_DIR} is not a git repository." >&2
  exit 1
fi

echo "[1/3] Enabling service ${SERVICE_NAME}..."
systemctl enable "${SERVICE_NAME}.service"

echo "[2/3] Pulling latest code..."
git -C "${REPO_DIR}" pull

echo "[3/3] Restarting service ${SERVICE_NAME}..."
systemctl restart "${SERVICE_NAME}.service"

systemctl status "${SERVICE_NAME}.service" --no-pager -n 5 || true
echo "Done."
