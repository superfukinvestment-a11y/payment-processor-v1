#!/bin/sh
# Dev-mode startup for the Base44 sandbox.
# 1. The forge-std git submodule is a separate repository and is empty in a fresh clone.
# 2. node_modules is provided by a Docker volume, so it is installed from the lockfile here.
# 3. serve.js then rebuilds/re-tests on change and serves the dashboard on port 3000.
set -eu

cd /app

if [ ! -f lib/forge-std/src/Test.sol ]; then
  echo "[start] initializing git submodules (forge-std, ds-test)"
  git config --global --add safe.directory /app
  git submodule update --init --recursive
fi

echo "[start] installing npm dependencies from package-lock.json"
npm ci --no-audit --no-fund

exec node /app/.base44/serve.js
