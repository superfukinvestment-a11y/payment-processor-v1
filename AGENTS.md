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
- **Slack panel**: shows the notification state (`GET /api/notify`). The server polls the watched database every 60 s and posts a Slack message when an entry reaches the target status ("Erledigt"). Detection lives in `TCB_Notion/lib/notion-slack.js`; the first poll only records the baseline, so already-completed projects are never announced. "Test senden" (`POST /api/notify/test`) verifies the webhook.
- **Accounts panel**: enter/store Notion Integration Token (saved in browser localStorage, sent as `x-notion-token` header)
- **Persisted settings (browser localStorage)**: `notion_token` (integration token) and `notion_db_id` (Notion database ID, saved via the "ID speichern" button or on "Projekte laden"). On page load the saved database ID is restored into the input; entries are auto-loaded only when a client-side token is present.

## How It Runs

`docker-compose.base44.yml` runs the TrustCoreBank server:
- `node:22` base image, source bind-mounted at `/app`
- `npm install` + `node notion-proxy.js` on port 3000
- `NOTION_TOKEN` delivered via `/run/base44/app.env` (user-supplied secret)
- The token can also be entered directly in the dashboard UI (stored in localStorage, sent as header)
- `SLACK_WEBHOOK_URL` delivered via `/run/base44/app.env`; while it is empty the Slack notification stays inactive (the server logs "inaktiv")
- Notification state (watched database ID + last known statuses) lives in the `tcb_state` volume at `/app/TCB_Notion/data/state.json`, so it survives restarts
- `NOTIFY_STATUS` (default `Erledigt`) and `NOTIFY_POLL_SECONDS` (default `60`) tune the notification; the UI can override the target status and database ID via `POST /api/notify`

## Secrets

- `NOTION_TOKEN` — Notion Integration Token (optional at boot; app runs without it, UI shows "nicht verbunden")
  - Get it at: https://www.notion.so/my-integrations → New integration
  - Share databases with the integration: Notion page → ••• → Connections
- `SLACK_WEBHOOK_URL` — Slack Incoming Webhook URL (optional at boot)
  - Create it at https://api.slack.com/apps → New App → Incoming Webhooks → Add New Webhook to Workspace

## Verifying It Works

```bash
curl -sf http://localhost:3000/health    # → {"status":"ok","notion_connected":true}
curl -sf http://localhost:3000/          # → Dashboard HTML
curl -sf http://localhost:3000/api/notify # → notification state (active/slack_configured/last_check)
```

The notification pipeline can be exercised without real Notion/Slack by calling `runNotifyCycle` from
`lib/notion-slack.js` against local mock servers (pass `apiBase`, `slackWebhookUrl` and `fetchImpl`);
it is importable standalone and has no side effects.

## NotebookLM Note

Google NotebookLM has **no public API**. The dashboard exports Notion entries as Markdown text
that the user copies and pastes as a source in https://notebooklm.google.com.
