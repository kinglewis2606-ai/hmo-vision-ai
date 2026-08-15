#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

EXPECTED_BRANCH="fix/hmo-production-recovery"
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "ERROR: expected branch $EXPECTED_BRANCH, currently on $BRANCH"
  echo "Run: git checkout $EXPECTED_BRANCH"
  exit 1
fi

echo "== HMO Vision AI VPS recovery =="
echo "Branch: $BRANCH"

echo "Pulling latest recovery branch..."
git pull --ff-only origin "$EXPECTED_BRANCH"

echo "Installing exact dependencies..."
npm ci

echo "Generating Prisma client..."
npx prisma generate

echo "Running geometry tests..."
npm run test:geometry

echo "Building production application..."
npm run build

echo "Checking local Next.js listener..."
if ! curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
  echo "Next.js is not currently responding on 127.0.0.1:3000; PM2 will be restarted."
fi

echo "Starting/restarting PM2 application..."
pm2 status >/dev/null 2>&1 || true
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

echo "Ensuring Nginx is running..."
sudo nginx -t
sudo systemctl restart nginx

echo "Waiting for application..."
for i in {1..30}; do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:3000/ >/dev/null; then
    echo "Next.js is responding on 127.0.0.1:3000."
    break
  fi
  if [[ "$i" == "30" ]]; then
    echo "ERROR: Next.js did not become ready."
    pm2 status || true
    pm2 logs hmo-vision-ai --lines 80 --nostream || true
    exit 1
  fi
  sleep 1
done

echo "== Recovery complete =="
pm2 status
sudo systemctl --no-pager --full status nginx | sed -n '1,18p'
