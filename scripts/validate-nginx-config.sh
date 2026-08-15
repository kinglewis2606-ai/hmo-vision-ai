#!/usr/bin/env bash
set -euo pipefail

CONFIG="${1:-deploy/nginx/hmo-vision-ai.conf}"

test -f "$CONFIG"

grep -Eq '^\s*proxy_read_timeout\s+360s;' "$CONFIG"
grep -Eq '^\s*proxy_send_timeout\s+360s;' "$CONFIG"
grep -Eq '^\s*proxy_connect_timeout\s+10s;' "$CONFIG"
grep -Eq '^\s*proxy_buffering\s+off;' "$CONFIG"
grep -Eq '^\s*proxy_pass\s+http://127\.0\.0\.1:3000;' "$CONFIG"

echo "Nginx analysis proxy configuration checks passed."
