#!/usr/bin/env bash
# Domino App entry point: serves the app on 0.0.0.0:8888 (the address Domino Apps expect).
#
# Default: the Python server (standard library only) serves the prebuilt app in domino/app/,
# so no Node.js, npm or internet access is needed at start-up.
# Set SSB_BUILD=1 to build from source with Node.js 20+ instead.
# AI: set OPENAI_API_KEY as a Domino environment variable (optional OPENAI_BASE_URL, STUDIO_AI_MODEL).
set -euo pipefail
cd "$(dirname "$0")"
export HOST=0.0.0.0 PORT=8888

if [ "${SSB_BUILD:-0}" = "1" ]; then
  echo "SSB_BUILD=1: building from source with $(node --version)"
  npm ci --no-audit --no-fund
  npm run build
  exec node server/serve.mjs
fi

PY="$(command -v python3 || command -v python)"
echo "Starting Study Schema Builder with $($PY --version 2>&1)"
exec "$PY" server/serve.py
