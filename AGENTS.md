# Repository notes for agents

Solidity contracts repo (Foundry + Hardhat). There is **no web frontend**: the
deliverable is the `PaymentProcessor` contract, its tests and its Foundry build.

## Running it in the Base44 sandbox

```bash
docker compose -f docker-compose.base44.yml up -d --build
curl -s localhost:3000/api/status
```

* `.base44/Dockerfile` — `node:22` + Foundry (`foundryup`). Toolchain only; source is bind-mounted.
* `.base44/start.sh` — initializes the `lib/forge-std` submodule when empty, runs `npm ci`, then starts the preview server.
* `.base44/serve.js` — serves the build/test dashboard on port 3000 (`/health`, `/api/status`) and re-runs `forge build` + `forge test` when a `.sol`/`.toml` file changes.

### A fresh clone does not build on its own

Two things are missing after a plain `git clone` (and this was the startup failure):

1. `lib/forge-std` is a **git submodule**, empty until `git submodule update --init --recursive`.
2. `remappings.txt` + `libs` in `foundry.toml` resolve `@openzeppelin/…`, `@limitbreak/…` and
   `@rari-capital/solmate/…` into `node_modules`, so `npm ci` must run before `forge build`.
   Skipping it fails with `Source "…/node_modules/@openzeppelin/…" not found`.

## Build / test facts

* `forge build` passes (only lint notes, e.g. `tx.origin` warnings in `PaymentProcessor.sol`).
* `forge test --no-match-path Benchmark` passes: 91 suites, 230 tests.
* The benchmark suites under `test/foundry/gas/` are excluded from the preview run — they move whole
  mainnet collections and are meant to be run deliberately (see README "Benchmarks").
* `forge build --sizes` exits non-zero on current Foundry versions: the **test** handler
  `PaymentProcessorHandler` is 38,922 B, over the EIP-170 runtime limit. The production contract
  `PaymentProcessor` itself is 24,573 B (limit 24,576 B, i.e. a 3-byte margin). This is a property of
  test scaffolding, not a regression — do not shrink the handler to make `--sizes` green.
* Preview fuzz settings (`FOUNDRY_FUZZ_RUNS=256`, `FOUNDRY_INVARIANT_RUNS=10`,
  `FOUNDRY_INVARIANT_DEPTH=50`) are set only in `docker-compose.base44.yml`; the committed
  `foundry.toml` profile and CI are unchanged.
