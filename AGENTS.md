# AGENTS.md — Base44 Dev Environment

## Project Overview

This is **Limit Break's Payment Processor Contracts** — a Solidity smart-contract repository.
There is **no web frontend or backend API server**. The project consists of:
- Solidity contracts (`contracts/`) — `PaymentProcessor.sol` is the main contract (~120KB)
- Foundry tests (`test/foundry/`) — functional tests + gas benchmarks
- Hardhat config (`hardhat.config.js`) — integrates with Foundry via `@nomicfoundation/hardhat-foundry`
- Deployment scripts (`scripts/`) — per-network deploy scripts

## How It Runs in Base44

Since there's no web server, the Base44 compose (`docker-compose.base44.yml`) runs a **Foundry build & test status page** on port 3000:
- `node:22` base image with Foundry installed via `foundryup`
- On startup: initializes the `forge-std` git submodule, runs `npm install`, then starts `.base44/serve.js`
- `serve.js` runs `forge build` + `forge test --no-match-path Benchmark` and serves an HTML report on port 3000
- File watcher re-runs build+test when `.sol` or `.toml` files change (excludes `out/`, `cache`, `forge-cache`, `broadcast`)

## Key Details

- **Gas benchmark tests** (`test/foundry/gas/Benchmark.t.sol`) are **excluded** from the default test run — they run 100 iterations of 100-item bundles/sweeps and hit out-of-gas by design. Run them separately with `forge test --match-path Benchmark`.
- **Fuzz runs reduced** to 256 (from 10000 in `foundry.toml`) via `FOUNDRY_FUZZ_RUNS=256` env var for faster preview iteration. Invariant runs/depth also reduced.
- **Solidity version**: 0.8.9
- **Dependencies**: `@openzeppelin/contracts` 4.7.3, `@limitbreak/creator-token-contracts` 1.0.5 — installed via `npm install` (remappings point to `node_modules/`)
- **forge-std**: git submodule at `lib/forge-std` (must be initialized with `git submodule update --init --recursive`)

## Verifying It Works

```bash
# From host:
curl -sf http://localhost:3000/   # Should return HTML with build/test results

# Inside the container:
docker compose -f docker-compose.base44.yml exec app forge build
docker compose -f docker-compose.base44.yml exec app forge test --no-match-path Benchmark
```

Expected: 230 tests pass across 91 suites (with reduced fuzz runs).

## No External Secrets Required

This project does not require any external API keys or credentials.
