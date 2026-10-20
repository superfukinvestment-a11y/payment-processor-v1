// Preview server for the Payment Processor contracts repo.
//
// There is no web frontend in this repository, so the sandbox preview serves a
// status dashboard instead: it builds the contracts and runs the Foundry test
// suite with the repo's own commands, then shows the real compiler/test output.
// Any .sol or .toml edit re-runs the pipeline, so the preview reflects the code.
const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");

const PORT = 3000;
const APP_DIR = "/app";
const BUILD_CMD = "forge build 2>&1";
// The gas benchmark suites transfer the full mainnet collection on every run, so
// they are excluded here (they are run explicitly, see README "Benchmarks").
const TEST_CMD = "forge test --no-match-path Benchmark 2>&1";

const state = {
  running: false,
  build: { ok: null, output: "" },
  test: { ok: null, output: "", summary: "" },
  lastRun: null,
};

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function summarizeTestOutput(output) {
  const lines = output.trim().split("\n").reverse();
  for (const line of lines) {
    if (/^\d+ tests? passed/.test(line) || /Ran \d+ test suites/.test(line)) return line.trim();
  }
  return "";
}

function run(command) {
  try {
    return { ok: true, output: execSync(command, { cwd: APP_DIR, encoding: "utf8", timeout: 600000 }) };
  } catch (e) {
    return { ok: false, output: `${e.stdout || ""}${e.stderr || ""}${e.message || ""}` };
  }
}

function runPipeline() {
  if (state.running) return;
  state.running = true;
  console.log("[serve] running build + tests");

  const build = run(BUILD_CMD);
  state.build = { ok: build.ok, output: build.output };
  state.test = build.ok ? { ok: null, output: "", summary: "" } : state.test;

  if (build.ok) {
    const test = run(TEST_CMD);
    state.test = { ok: test.ok, output: test.output, summary: summarizeTestOutput(test.output) };
  }

  state.running = false;
  state.lastRun = new Date().toISOString();
  console.log(`[serve] build=${state.build.ok} test=${state.test.ok}`);
}

function badge(ok) {
  if (ok === null) return '<span class="badge pending">pending</span>';
  return ok ? '<span class="badge ok">pass</span>' : '<span class="badge fail">fail</span>';
}

function card(title, result, emptyText) {
  const body = result.output
    ? `<pre>${esc(result.output.trim())}</pre>`
    : `<p class="meta">${esc(emptyText)}</p>`;
  return `<section class="card">
      <header><h2>${title}</h2>${badge(result.ok)}</header>
      ${body}
    </section>`;
}

function page() {
  const running = state.running ? '<span class="badge pending">running</span>' : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment Processor Contracts</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --border:#30363d; --text:#e6edf3; --muted:#8b949e;
          --green:#3fb950; --red:#f85149; --amber:#d29922; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  header.top { padding:28px 24px; border-bottom:1px solid var(--border); }
  header.top h1 { margin:0 0 6px; font-size:22px; letter-spacing:-0.01em; }
  header.top p { margin:0; color:var(--muted); font-size:14px; }
  main { max-width:1040px; margin:0 auto; padding:24px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:8px;
          margin-bottom:18px; overflow:hidden; }
  .card > header { display:flex; align-items:center; justify-content:space-between; gap:12px;
                   padding:14px 18px; border-bottom:1px solid var(--border); }
  .card h2 { margin:0; font-size:15px; font-weight:600; }
  .badge { font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;
           padding:3px 9px; border-radius:11px; }
  .badge.ok { background:rgba(63,185,80,.15); color:var(--green); }
  .badge.fail { background:rgba(248,81,73,.15); color:var(--red); }
  .badge.pending { background:rgba(210,153,34,.15); color:var(--amber); }
  pre { margin:0; padding:16px 18px; font-size:12.5px; line-height:1.55; max-height:420px;
        overflow:auto; white-space:pre-wrap; word-break:break-word;
        font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .meta { margin:0; padding:14px 18px; color:var(--muted); font-size:13px; }
  footer { color:var(--muted); font-size:12.5px; padding:4px 2px 28px; }
</style>
</head>
<body>
<header class="top">
  <h1>Payment Processor Contracts</h1>
  <p>Foundry build &amp; test status for this branch ${running}</p>
</header>
<main>
  ${card("Compilation — forge build", state.build, "Waiting for the first build…")}
  ${card("Tests — forge test", { ...state.test, output: state.test.summary ? `${state.test.summary}\n${state.test.output}` : state.test.output },
    state.build.ok === false ? "Tests are skipped while the build fails." : "Tests run after a successful build.")}
  <footer>Last run: ${esc(state.lastRun || "never")} · Gas benchmark suites excluded · Fuzz runs tuned for the preview (see docker-compose.base44.yml) · Refreshes every 5s.</footer>
</main>
<script>setTimeout(() => location.reload(), 5000);</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/health") {
    const healthy = state.build.ok !== false && state.test.ok !== false;
    res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: healthy ? "ok" : "degraded", running: state.running,
      build: state.build.ok, test: state.test.ok, lastRun: state.lastRun }));
    return;
  }
  if (pathname === "/api/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ running: state.running, build: state.build.ok,
      test: state.test.ok, testSummary: state.test.summary, lastRun: state.lastRun }));
    return;
  }
  if (pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page());
    return;
  }
  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[serve] listening on 0.0.0.0:${PORT}`);
  runPipeline();
});

// Re-run the pipeline when contracts, tests or the build config change.
let debounce;
try {
  fs.watch(APP_DIR, { recursive: true }, (_event, file) => {
    if (!file) return;
    const relevant = (file.endsWith(".sol") || file.endsWith(".toml")) &&
      !/^(out|forge-cache|cache|broadcast|node_modules|lib)[/\\]/.test(file);
    if (!relevant) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log(`[serve] changed: ${file}`);
      runPipeline();
    }, 1500);
  });
} catch (e) {
  console.log("[serve] file watching unavailable:", e.message);
}
