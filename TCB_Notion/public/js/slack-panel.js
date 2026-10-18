/* ═══════════════════════════════════════
   SLACK NOTIFICATION PANEL
   Der Server überwacht die Notion-Datenbank
   und meldet Einträge, die auf den Zielstatus
   (Standard: "Erledigt") gesetzt werden.
═══════════════════════════════════════ */

function slackSetStatus(text, color) {
  const el = document.getElementById("slack-status");
  if (!el) return;
  el.textContent = "● " + text;
  el.style.color = color;
}

async function slackRefresh() {
  try {
    const resp = await fetch("/api/notify");
    const state = await resp.json();
    renderSlackState(state);
  } catch (e) {
    slackSetStatus("Server nicht erreichbar", "#f85149");
  }
}

function renderSlackState(state) {
  if (state.active) {
    slackSetStatus("Aktiv", "#3fb950");
  } else if (!state.slack_configured) {
    slackSetStatus("Slack-Webhook fehlt", "#d29922");
  } else if (!state.database_id) {
    slackSetStatus("Datenbank-ID fehlt", "#d29922");
  } else {
    slackSetStatus("Inaktiv", "#4F6070");
  }

  const info = document.getElementById("slack-info");
  if (!info) return;
  const lines = [
    `Meldet automatisch, sobald ein Notion-Eintrag auf <b style="color:var(--muted);">${escHtml(state.target_status)}</b> gesetzt wird.`,
    `<b style="color:var(--muted);">Überwachte Datenbank:</b> ${state.database_id ? escHtml(state.database_id) : "— im Notion-Panel Datenbank-ID speichern"}`,
  ];
  if (state.last_check) lines.push(`<b style="color:var(--muted);">Letzte Prüfung:</b> ${new Date(state.last_check).toLocaleString("de-DE")}`);
  if (state.last_result) lines.push(escHtml(state.last_result));
  if (state.last_error) lines.push(`<span style="color:#d29922;">Hinweis: ${escHtml(state.last_error)}</span>`);
  info.innerHTML = lines.join("<br>");
}

/* Übernimmt die im Notion-Panel gespeicherte Datenbank-ID für die Überwachung. */
async function slackSyncDatabase(dbId) {
  if (!dbId) return;
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ database_id: dbId }),
    });
  } catch (e) {
    /* Die Anzeige unten zeigt den Zustand ohnehin an */
  }
  slackRefresh();
}

async function slackTest() {
  slackSetStatus("Teste...", "#d29922");
  try {
    const resp = await fetch("/api/notify/test", { method: "POST" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Test fehlgeschlagen");
    slackSetStatus("Testnachricht gesendet ✓", "#3fb950");
  } catch (e) {
    slackSetStatus("Fehler: " + e.message, "#f85149");
  }
}

document.addEventListener("DOMContentLoaded", slackRefresh);
