#!/bin/bash
set -e

export PATH="/root/.foundry/bin:$PATH"

echo "=== Installing Foundry ==="
if ! command -v forge &>/dev/null; then
  curl -L https://foundry.paradigm.xyz | bash
  foundryup
fi

cd /app

echo "=== Initializing git submodule (forge-std) ==="
git submodule update --init --recursive

echo "=== Installing npm dependencies ==="
npm install

echo "=== Starting preview server ==="
exec node /app/.base44/serve.js
