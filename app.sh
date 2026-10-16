#!/usr/bin/env bash
# Domino App entry point: builds the app and serves it on 0.0.0.0:8888 (the port Domino Apps expect).
# Needs Node.js 20+ in the compute environment. Set OPENAI_API_KEY as a Domino environment variable for AI.
set -euo pipefail
cd "$(dirname "$0")"
node --version
npm ci --no-audit --no-fund
npm run build
HOST=0.0.0.0 PORT=8888 exec node server/serve.mjs
