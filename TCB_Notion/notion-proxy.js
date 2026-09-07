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
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const NOTION_TOKEN_ENV = process.env.NOTION_TOKEN || "";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TrustCoreBank Server auf Port ${PORT} — Notion: ${NOTION_TOKEN_ENV ? "verbunden (env)" : "nicht verbunden (Token im UI eingeben)"}`);
});
