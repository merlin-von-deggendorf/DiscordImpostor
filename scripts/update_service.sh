#!/usr/bin/env bash
set -euo pipefail

# Enables the service, pulls latest code, and restarts the bot.

SERVICE_NAME="${SERVICE_NAME:-discord-impostor}"
REPO_DIR="${REPO_DIR:-$(pwd)}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_REMOTE_URL="${GIT_REMOTE_URL:-git@github.com:merlin-von-deggendorf/DiscordImpostor.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"

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

# Ensure the remote exists (adds it if missing).
if ! git -C "${REPO_DIR}" remote get-url "${GIT_REMOTE}" >/dev/null 2>&1; then
  git -C "${REPO_DIR}" remote add "${GIT_REMOTE}" "${GIT_REMOTE_URL}"
fi

echo "[1/3] Enabling service ${SERVICE_NAME}..."
systemctl enable "${SERVICE_NAME}.service"

echo "[2/3] Pulling latest code from ${GIT_REMOTE}/${GIT_BRANCH}..."
git -C "${REPO_DIR}" pull "${GIT_REMOTE}" "${GIT_BRANCH}"

echo "[3/3] Restarting service ${SERVICE_NAME}..."
systemctl restart "${SERVICE_NAME}.service"

systemctl status "${SERVICE_NAME}.service" --no-pager -n 5 || true
echo "Done."
