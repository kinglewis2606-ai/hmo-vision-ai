#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT_DIR/deploy/nginx/hmo-vision-ai.conf"
TARGET="/etc/nginx/sites-available/hmo-vision-ai"
ENABLED="/etc/nginx/sites-enabled/hmo-vision-ai"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo: sudo bash scripts/install-nginx-config.sh" >&2
  exit 1
fi

install -m 0644 "$SOURCE" "$TARGET"
ln -sfn "$TARGET" "$ENABLED"
nginx -t
systemctl reload nginx

echo "Nginx configuration installed and reloaded successfully."
