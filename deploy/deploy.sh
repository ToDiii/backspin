#!/usr/bin/env bash
# Deploy von Backspin: neuesten main-Stand holen, bauen, Caddy neu laden.
# Erwartet einen Klon in /opt/backspin, dessen origin per read-only
# Deploy-Key erreichbar ist. Der Build landet in /opt/backspin/dist,
# genau dort, wohin der Caddy-Snippet zeigt.
set -euo pipefail

APP_DIR="/opt/backspin"

cd "$APP_DIR"

git fetch origin main
git reset --hard origin/main

npm ci --no-audit --no-fund
npm run build

systemctl reload caddy

echo "Deploy OK: $(date '+%Y-%m-%d %H:%M:%S %Z')"
