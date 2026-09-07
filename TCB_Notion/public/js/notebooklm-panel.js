/* ═══════════════════════════════════════
   NOTEBOOKLM PANEL LOGIC
   NotebookLM has no public API — we export
   Notion entries as Markdown for manual upload.
═══════════════════════════════════════ */

/* ── Export a single selected entry ─────── */
function notebooklmExportSelected() {
  if (!notionEntries || !notionEntries.length) {
    alert("Zuerst Notion-Einträge laden (Datenbank-ID eingeben → Projekte laden).");
    return;
  }
  const rows = document.querySelectorAll("#notion-rows .tbl-row");
  let selected = null;
  rows.forEach(r => {
    if (r.style.background && r.style.background !== "") selected = r;
  });
  if (!selected) {
    const list = notionEntries.map((e, i) => `${i + 1}. ${e.title}`).join("\n");
    const idx = prompt("Welchen Eintrag exportieren? (Nummer eingeben)\n\n" + list);
    if (!idx) return;
    const entry = notionEntries[parseInt(idx) - 1];
    if (!entry) return alert("Ungültige Auswahl.");
    showExport(buildMarkdown(entry));
    return;
  }
  const id = selected.dataset.id;
  const entry = notionEntries.find(e => e.id === id);
  if (entry) showExport(buildMarkdown(entry));
}

/* ── Export all loaded entries ───────────── */
function notebooklmExportAll() {
  if (!notionEntries || !notionEntries.length) {
    alert("Zuerst Notion-Einträge laden.");
    return;
  }
  const md = notionEntries.map(buildMarkdown).join("\n\n---\n\n");
  showExport(md);
}

/* ── Build markdown for one entry ───────── */
function buildMarkdown(entry) {
  const date = new Date(entry.created).toLocaleDateString("de-DE");
  return `# ${entry.title}

**Status:** ${entry.status}
**Erstellt:** ${date}
**Notion URL:** ${entry.url}

---

*Exportiert aus Notion via TrustCoreBank Pro für Google NotebookLM*`;
}

/* ── Show export box ────────────────────── */
function showExport(text) {
  const area = document.getElementById("notebooklm-export-area");
  const ta = document.getElementById("notebooklm-export-text");
  area.style.display = "block";
  ta.value = text;
  ta.focus();
  ta.select();
  const status = document.getElementById("notebooklm-conn-status");
  status.textContent = "● Export bereit";
  status.style.color = "#3fb950";
}

/* ── Copy to clipboard ──────────────────── */
function notebooklmCopyExport() {
  const ta = document.getElementById("notebooklm-export-text");
  ta.select();
  document.execCommand("copy");
  const status = document.getElementById("notebooklm-conn-status");
  status.textContent = "● Kopiert!";
  setTimeout(() => {
    status.textContent = "● Export bereit";
  }, 2000);
}

/* ── Download as .md file ────────────────── */
function notebooklmDownloadExport() {
  const text = document.getElementById("notebooklm-export-text").value;
  if (!text) return;
  const blob = new Blob([text], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `notion-export-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
