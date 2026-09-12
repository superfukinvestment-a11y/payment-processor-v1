# AGENTS.md — Base44 Dev Environment

## Project Overview

This repo contains two projects:

### 1. Payment Processor Contracts (Solidity)
Limit Break's ERC721-C compatible payment processing smart contracts. Foundry + Hardhat. No web UI.
- Main contract: `contracts/PaymentProcessor.sol`
- Tests: `test/foundry/` (230 functional tests pass, gas benchmarks excluded — OOG by design)
- Build: `forge build` · Test: `forge test --no-match-path Benchmark`
- Requires: `git submodule update --init --recursive` (forge-std) + `npm install`

### 2. TrustCoreBank Notion Integration (Node.js)
A dashboard (`TCB_Notion/`) that connects to Notion and exports entries to Google NotebookLM.
- **Server**: `TCB_Notion/notion-proxy.js` — Express server on port 3000, proxies Notion API calls
- **Dashboard**: `TCB_Notion/public/TrustCoreBank_Pro.html` — dark-themed UI with Notion + NotebookLM panels
- **Notion panel**: load database entries, search workspace, create new entries, open in Notion
- **NotebookLM panel**: export Notion entries as Markdown for manual upload to notebooklm.google.com (no public API exists)
- **Accounts panel**: enter/store Notion Integration Token (saved in browser localStorage, sent as `x-notion-token` header)

## How It Runs

`docker-compose.base44.yml` runs the TrustCoreBank server:
- `node:22` base image, source bind-mounted at `/app`
- `npm install` + `node notion-proxy.js` on port 3000
- `NOTION_TOKEN` delivered via `/run/base44/app.env` (user-supplied secret)
- The token can also be entered directly in the dashboard UI (stored in localStorage, sent as header)

## Secrets

- `NOTION_TOKEN` — Notion Integration Token (optional at boot; app runs without it, UI shows "nicht verbunden")
  - Get it at: https://www.notion.so/my-integrations → New integration
  - Share databases with the integration: Notion page → ••• → Connections

## Verifying It Works

```bash
curl -sf http://localhost:3000/health    # → {"status":"ok","notion_connected":true}
curl -sf http://localhost:3000/          # → Dashboard HTML
```

## NotebookLM Note

Google NotebookLM has **no public API**. The dashboard exports Notion entries as Markdown text
that the user copies and pastes as a source in https://notebooklm.google.com.
