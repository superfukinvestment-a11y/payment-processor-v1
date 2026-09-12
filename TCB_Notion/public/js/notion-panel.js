/* ═══════════════════════════════════════
   NOTION PANEL LOGIC
═══════════════════════════════════════ */

let notionConnected = false;
let notionEntries = [];
let notionDbId = "";

/* ── Token management ───────────────────── */
function getNotionToken() {
  return localStorage.getItem("notion_token") || "";
}

function setNotionToken(token) {
  localStorage.setItem("notion_token", token);
}

/* ── API helper ─────────────────────────── */
async function notionApi(path, method, body) {
  const token = getNotionToken();
  if (!token) throw new Error("Kein Notion-Token. In den Konten-Einstellungen eingeben.");
  const opts = { method, headers: { "Content-Type": "application/json", "x-notion-token": token } };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(path, opts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Notion API Fehler");
  return data;
}

/* ── Status helpers ─────────────────────── */
function notionSetStatus(msg) {
  document.getElementById("notion-status-msg").textContent = msg;
}

function notionSetConn(connected) {
  notionConnected = connected;
  const dot = document.getElementById("notion-conn-status");
  const btn = document.getElementById("notion-conn-btn");
  if (connected) {
    dot.textContent = "● Verbunden";
    dot.style.color = "#3fb950";
    btn.textContent = "VERBUNDEN";
    btn.style.opacity = ".6";
  } else {
    dot.textContent = "● Nicht verbunden";
    dot.style.color = "#4F6070";
    btn.textContent = "VERBINDEN";
    btn.style.opacity = "1";
  }
}

/* ── Accounts ───────────────────────────── */
function accountsSave() {
  const token = document.getElementById("notion-token-input").value.trim();
  if (!token) return alert("Token eingeben.");
  setNotionToken(token);
  document.getElementById("notion-token-input").value = "";
  updateAccountsStatus();
  notionConnect();
}

function accountsTest() {
  const token = document.getElementById("notion-token-input").value.trim() || getNotionToken();
  if (!token) return alert("Kein Token vorhanden.");
  setNotionToken(token);
  notionConnect();
}

function accountsClear() {
  localStorage.removeItem("notion_token");
  document.getElementById("notion-token-input").value = "";
  notionSetConn(false);
  updateAccountsStatus();
  notionSetStatus("Token gelöscht");
}

async function updateAccountsStatus() {
  const token = getNotionToken();
  const el = document.getElementById("accounts-status");
  if (token) {
    el.textContent = "● Notion: verbunden";
    el.style.color = "#3fb950";
    return;
  }
  try {
    const resp = await fetch("/health");
    const health = await resp.json();
    if (health.notion_connected) {
      el.textContent = "● Notion: verbunden (Server-Token)";
      el.style.color = "#3fb950";
    } else {
      el.textContent = "● Nicht verbunden";
      el.style.color = "#4F6070";
    }
  } catch (e) {
    el.textContent = "● Nicht verbunden";
    el.style.color = "#4F6070";
  }
}

/* ── Connect ────────────────────────────── */
async function notionConnect() {
  notionSetStatus("Verbinde...");
  try {
    const resp = await fetch("/health");
    const health = await resp.json();
    if (health.notion_connected) {
      notionSetConn(true);
      notionSetStatus("Verbunden" + (getNotionToken() ? "" : " (Server-Token)"));
      return;
    }
  } catch (e) { /* fall through */ }
  if (!getNotionToken()) {
    notionSetConn(false);
    notionSetStatus("Kein Token — oben eingeben");
    return;
  }
  try {
    await notionApi("/api/search", "POST", { page_size: 1 });
    notionSetConn(true);
    notionSetStatus("Verbunden");
  } catch (e) {
    notionSetConn(false);
    notionSetStatus("Fehler: " + e.message);
  }
}

/* ── Load projects ──────────────────────── */
async function notionLoadProjects() {
  notionDbId = document.getElementById("notion-db-id").value.trim().replace(/-/g, "");
  if (!notionDbId) return alert("Datenbank-ID eingeben.");
  notionSetStatus("Lade Projekte...");
  try {
    const data = await notionApi(`/api/databases/${notionDbId}/query`, "POST", { page_size: 100 });
    notionEntries = data.results || [];
    renderNotionTable(notionEntries);
    notionSetStatus(`${notionEntries.length} Einträge geladen`);
  } catch (e) {
    notionSetStatus("Fehler: " + e.message);
    renderNotionTable([]);
  }
}

/* ── Search ─────────────────────────────── */
function notionToggleSearch() {
  const row = document.getElementById("notion-search-row");
  row.style.display = row.style.display === "none" ? "block" : "none";
  if (row.style.display === "block") document.getElementById("notion-search-input").focus();
}

async function notionDoSearch() {
  const query = document.getElementById("notion-search-input").value.trim();
  if (!query) return;
  notionSetStatus("Suche...");
  try {
    const data = await notionApi("/api/search", "POST", { query, page_size: 50 });
    notionEntries = data.results || [];
    renderNotionTable(notionEntries);
    notionSetStatus(`${notionEntries.length} Treffer`);
  } catch (e) {
    notionSetStatus("Fehler: " + e.message);
  }
}

/* ── Create entry ──────────────────────── */
function notionCreateEntry() {
  if (!notionDbId) return alert("Zuerst Datenbank-ID eingeben und Projekte laden.");
  document.getElementById("create-modal").classList.add("show");
  document.getElementById("create-name").focus();
}

function closeModal() {
  document.getElementById("create-modal").classList.remove("show");
  document.getElementById("create-name").value = "";
  document.getElementById("create-status").value = "";
}

async function createSubmit() {
  const name = document.getElementById("create-name").value.trim();
  if (!name) return alert("Name eingeben.");
  const status = document.getElementById("create-status").value.trim();
  notionSetStatus("Erstelle Eintrag...");
  try {
    const properties = { Name: { title: [{ text: { content: name } }] } };
    if (status) properties.Status = { select: { name: status } };
    await notionApi("/api/pages", "POST", {
      parent: { database_id: notionDbId },
      properties,
    });
    closeModal();
    notionSetStatus("Eintrag erstellt");
    notionLoadProjects();
  } catch (e) {
    notionSetStatus("Fehler: " + e.message);
  }
}

/* ── Refresh ────────────────────────────── */
function notionRefresh() {
  if (notionDbId) notionLoadProjects();
  else notionConnect();
}

/* ── Render table ──────────────────────── */
function renderNotionTable(entries) {
  const rows = document.getElementById("notion-rows");
  document.getElementById("notion-entry-count").textContent = entries.length ? `${entries.length} Einträge` : "";
  if (!entries.length) {
    rows.innerHTML = '<div class="tbl-empty">Keine Einträge gefunden</div>';
    return;
  }
  rows.innerHTML = entries.map(e => {
    const date = new Date(e.created).toLocaleDateString("de-DE");
    return `<div class="tbl-row" data-id="${e.id}">
      <span>${escHtml(e.title)}</span>
      <span class="status-pill">${escHtml(e.status)}</span>
      <span style="color:var(--muted);font-size:9px;">${date}</span>
      <span><a class="open-link" href="${e.url}" target="_blank">↗ OPEN</a></span>
    </div>`;
  }).join("");
}

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ── Init ───────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  updateAccountsStatus();
  notionConnect();
});
