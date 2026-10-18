/**
 * TrustCoreBank · Notion → Slack Benachrichtigungen
 *
 * Prüft die Status der Einträge einer Notion-Datenbank und schickt eine
 * Slack-Nachricht, sobald ein Eintrag den Zielstatus (Standard: "Erledigt")
 * erreicht.
 *
 * Die Funktionen hier haben keine Seiteneffekte (kein Datei-/Netzwerkzustand
 * außer den übergebenen Parametern), damit sie einzeln testbar bleiben.
 */

const DEFAULT_NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_PAGES = 10; // 10 × 100 Einträge pro Prüfdurchlauf

function getPageTitle(page) {
  const props = page.properties || {};
  for (const key of ["Name", "Titel", "Title", "Projekt"]) {
    if (props[key]?.title?.[0]?.plain_text) return props[key].title[0].plain_text;
  }
  return "Ohne Titel";
}

function getPageStatus(page) {
  const props = page.properties || {};
  for (const key of ["Status", "Phase", "State"]) {
    if (props[key]?.status?.name) return props[key].status.name;
    if (props[key]?.select?.name) return props[key].select.name;
  }
  return "";
}

/** Alle Einträge der Datenbank lesen (inkl. Seitenumbruch). */
async function fetchDatabasePages({ databaseId, token, apiBase = DEFAULT_NOTION_API, fetchImpl = fetch }) {
  const pages = [];
  let cursor = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const resp = await fetchImpl(`${apiBase}/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (data.object === "error") throw new Error(data.message);
    for (const page of data.results || []) {
      pages.push({ id: page.id, title: getPageTitle(page), status: getPageStatus(page), url: page.url });
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return pages;
}

/**
 * Vergleicht die aktuellen Status mit den zuletzt bekannten.
 * Ein Eintrag gilt nur dann als "gerade erledigt", wenn er vorher schon bekannt
 * war — der erste Durchlauf legt also nur den Ausgangszustand fest und meldet
 * keine bereits abgeschlossenen Projekte erneut.
 */
function detectStatusChanges(knownStatuses, pages, targetStatus) {
  const statuses = { ...knownStatuses };
  const reached = [];
  for (const page of pages) {
    const previous = knownStatuses[page.id];
    if (page.status === targetStatus && previous !== undefined && previous !== targetStatus) {
      reached.push(page);
    }
    statuses[page.id] = page.status;
  }
  return { reached, statuses };
}

function buildSlackMessage(page, targetStatus) {
  return {
    text: `✅ Notion: „${page.title}" ist jetzt ${targetStatus}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Notion-Eintrag erledigt:*\n<${page.url}|${page.title}>`,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Status: *${targetStatus}*` }],
      },
    ],
  };
}

async function postToSlack(webhookUrl, payload, fetchImpl = fetch) {
  const resp = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Slack antwortete mit HTTP ${resp.status}`);
  return true;
}

/**
 * Ein kompletter Prüfdurchlauf: Datenbank lesen, Wechsel erkennen, Slack senden.
 * Wirft bei Fehlern, damit der Aufrufer den Zustand unverändert lassen kann.
 */
async function runNotifyCycle({ databaseId, token, targetStatus, knownStatuses = {}, slackWebhookUrl, apiBase, fetchImpl }) {
  const pages = await fetchDatabasePages({ databaseId, token, apiBase, fetchImpl });
  const { reached, statuses } = detectStatusChanges(knownStatuses, pages, targetStatus);
  for (const page of reached) {
    await postToSlack(slackWebhookUrl, buildSlackMessage(page, targetStatus), fetchImpl);
  }
  return { checked: pages.length, notified: reached.map((p) => p.title), statuses };
}

module.exports = {
  fetchDatabasePages,
  detectStatusChanges,
  buildSlackMessage,
  postToSlack,
  runNotifyCycle,
};
