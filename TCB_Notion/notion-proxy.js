/**
 * TrustCoreBank · Notion Proxy Server
 * 
 * Combined server: serves the dashboard (static HTML) on port 3000
 * and proxies Notion API calls on /api/...
 * 
 * The Notion token can be provided via:
 *   1. NOTION_TOKEN env var (server-side, set via secrets)
 *   2. x-notion-token header (client-side, entered in the dashboard UI)
 * 
 * Google NotebookLM has no public API — the dashboard exports Notion entries
 * as markdown text for manual upload to https://notebooklm.google.com
 *
 * Slack notifications: the server polls the watched Notion database and posts
 * a Slack message whenever an entry reaches the target status ("Erledigt").
 * Requires the SLACK_WEBHOOK_URL secret; see lib/notion-slack.js.
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { runNotifyCycle, postToSlack } = require("./lib/notion-slack");

const app = express();
const PORT = process.env.PORT || 3000;
const NOTION_TOKEN_ENV = process.env.NOTION_TOKEN || "";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/* Slack-Benachrichtigung */
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || "";
const NOTIFY_STATUS_DEFAULT = process.env.NOTIFY_STATUS || "Erledigt";
const NOTIFY_POLL_SECONDS = Number(process.env.NOTIFY_POLL_SECONDS || 60);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

app.use(cors());
app.use(express.json());

/* ── Static dashboard ────────────────────────────────────── */
app.use(express.static(path.join(__dirname, "public")));

/* ── Dashboard route ─────────────────────────────────────── */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "TrustCoreBank_Pro.html"));
});

/* ── Health check ────────────────────────────────────────── */
app.get("/health", (req, res) => {
  const token = req.headers["x-notion-token"] || NOTION_TOKEN_ENV;
  res.json({ status: "ok", notion_connected: !!token });
});

/* ── Slack notification state ────────────────────────────── */
let notifyState = {
  databaseId: "",
  targetStatus: NOTIFY_STATUS_DEFAULT,
  statuses: {},
  lastCheck: null,
  lastResult: "",
  lastError: null,
};

function loadNotifyState() {
  try {
    Object.assign(notifyState, JSON.parse(fs.readFileSync(STATE_FILE, "utf8")));
  } catch (e) {
    /* erster Start — noch kein Zustand gespeichert */
  }
}

function saveNotifyState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(notifyState, null, 2));
  } catch (e) {
    console.error("Benachrichtigungs-Status konnte nicht gespeichert werden:", e.message);
  }
}

app.get("/api/notify", (req, res) => {
  res.json({
    database_id: notifyState.databaseId,
    target_status: notifyState.targetStatus,
    slack_configured: !!SLACK_WEBHOOK_URL,
    notion_configured: !!NOTION_TOKEN_ENV,
    active: !!(SLACK_WEBHOOK_URL && NOTION_TOKEN_ENV && notifyState.databaseId),
    last_check: notifyState.lastCheck,
    last_result: notifyState.lastResult,
    last_error: notifyState.lastError,
  });
});

app.post("/api/notify", (req, res) => {
  const { database_id, target_status } = req.body || {};
  if (typeof database_id === "string") notifyState.databaseId = database_id.trim().replace(/-/g, "");
  if (typeof target_status === "string" && target_status.trim()) notifyState.targetStatus = target_status.trim();
  saveNotifyState();
  res.json({ ok: true, database_id: notifyState.databaseId, target_status: notifyState.targetStatus });
});

app.post("/api/notify/test", async (req, res) => {
  if (!SLACK_WEBHOOK_URL) return res.status(400).json({ error: "Kein Slack-Webhook hinterlegt (SLACK_WEBHOOK_URL)." });
  try {
    await postToSlack(SLACK_WEBHOOK_URL, { text: "🔔 TrustCoreBank: Testnachricht — die Slack-Verbindung funktioniert." });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Notion API helper ───────────────────────────────────── */
async function notionFetch(endpoint, method, body, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(`${NOTION_API}${endpoint}`, options);
  return resp.json();
}

function getToken(req) {
  return req.headers["x-notion-token"] || NOTION_TOKEN_ENV;
}

/* ── Query database ──────────────────────────────────────── */
app.post("/api/databases/:id/query", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Notion-Token fehlt. In den Konten-Einstellungen eingeben." });
  try {
    const data = await notionFetch(`/databases/${req.params.id}/query`, "POST", req.body || {}, token);
    if (data.object === "error") return res.status(400).json({ error: data.message });
    const results = (data.results || []).map(formatPage);
    res.json({ results, has_more: data.has_more });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Search workspace ─────────────────────────────────────── */
app.post("/api/search", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Notion-Token fehlt." });
  try {
    const data = await notionFetch("/search", "POST", req.body || {}, token);
    if (data.object === "error") return res.status(400).json({ error: data.message });
    const results = (data.results || []).map(formatPage);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Create page ──────────────────────────────────────────── */
app.post("/api/pages", async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Notion-Token fehlt." });
  try {
    const data = await notionFetch("/pages", "POST", req.body, token);
    if (data.object === "error") return res.status(400).json({ error: data.message });
    res.json({ id: data.id, url: data.url, title: getNotionTitle(data) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Formatters ───────────────────────────────────────────── */
function getNotionTitle(page) {
  const props = page.properties || {};
  for (const key of ["Name", "Titel", "Title", "Projekt"]) {
    if (props[key]?.title?.[0]?.plain_text) return props[key].title[0].plain_text;
  }
  return "Ohne Titel";
}

function getNotionStatus(page) {
  const props = page.properties || {};
  for (const key of ["Status", "Phase", "State"]) {
    if (props[key]?.select?.name) return props[key].select.name;
    if (props[key]?.status?.name) return props[key].status.name;
  }
  return "—";
}

function formatPage(page) {
  return {
    id: page.id,
    title: getNotionTitle(page),
    status: getNotionStatus(page),
    created: page.created_time,
    url: page.url,
  };
}

/* ── Überwachung: meldet erledigte Projekte an Slack ─────── */
async function notifyCycle() {
  if (!SLACK_WEBHOOK_URL || !NOTION_TOKEN_ENV || !notifyState.databaseId) return;
  try {
    const result = await runNotifyCycle({
      databaseId: notifyState.databaseId,
      token: NOTION_TOKEN_ENV,
      targetStatus: notifyState.targetStatus,
      knownStatuses: notifyState.statuses,
      slackWebhookUrl: SLACK_WEBHOOK_URL,
    });
    notifyState.statuses = result.statuses;
    notifyState.lastError = null;
    notifyState.lastResult = result.notified.length
      ? `${result.notified.length} Benachrichtigung(en): ${result.notified.join(", ")}`
      : `${result.checked} Einträge geprüft, keine Änderung`;
  } catch (e) {
    notifyState.lastError = e.message;
    notifyState.lastResult = "";
  }
  notifyState.lastCheck = new Date().toISOString();
  saveNotifyState();
}

loadNotifyState();
setTimeout(notifyCycle, 3000);
setInterval(notifyCycle, NOTIFY_POLL_SECONDS * 1000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TrustCoreBank Server auf Port ${PORT} — Notion: ${NOTION_TOKEN_ENV ? "verbunden (env)" : "nicht verbunden (Token im UI eingeben)"}`);
  console.log(`Slack-Benachrichtigung: ${SLACK_WEBHOOK_URL ? `aktiv (Status "${notifyState.targetStatus}", alle ${NOTIFY_POLL_SECONDS}s)` : "inaktiv (SLACK_WEBHOOK_URL fehlt)"}`);
});
