const http = require("http");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const APP_DIR = "/app";

let state = {
  building: false,
  buildSuccess: null,
  buildOutput: "",
  testSuccess: null,
  testOutput: "",
  lastRun: null,
  error: null,
};

function esc(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function runBuildAndTest() {
  if (state.building) return;
  state.building = true;
  state.error = null;
  console.log("[serve] Running forge build + test...");

  try {
    state.buildOutput = execSync("forge build 2>&1", {
      cwd: APP_DIR,
      timeout: 180000,
      encoding: "utf8",
    });
    state.buildSuccess = true;
  } catch (e) {
    state.buildOutput = (e.stdout || "") + (e.stderr || "") + (e.message || "");
    state.buildSuccess = false;
    state.building = false;
    state.lastRun = new Date().toISOString();
    console.log("[serve] Build failed.");
    return;
  }

  try {
    state.testOutput = execSync("forge test --no-match-path Benchmark 2>&1", {
      cwd: APP_DIR,
      timeout: 600000,
      encoding: "utf8",
    });
    state.testSuccess = true;
  } catch (e) {
    state.testOutput = (e.stdout || "") + (e.stderr || "") + (e.message || "");
    state.testSuccess = false;
  }

  state.building = false;
  state.lastRun = new Date().toISOString();
  console.log("[serve] Done. build=" + state.buildSuccess + " test=" + state.testSuccess);
}

function render() {
  const statusBadge = (ok) =>
    ok === null
      ? '<span class="badge pending">pending</span>'
      : ok
      ? '<span class="badge ok">PASS</span>'
      : '<span class="badge fail">FAIL</span>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment Processor Contracts — Foundry</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --border:#30363d; --text:#e6edf3; --muted:#8b949e; --green:#3fb950; --red:#f85149; --yellow:#d29922; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; background:var(--bg); color:var(--text); }
  header { padding:24px 32px; border-bottom:1px solid var(--border); }
  header h1 { margin:0 0 4px; font-size:22px; }
  header p { margin:0; color:var(--muted); font-size:14px; }
  .container { max-width:1100px; margin:0 auto; padding:24px 32px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:8px; margin-bottom:20px; overflow:hidden; }
  .card-header { padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
  .card-header h2 { margin:0; font-size:16px; font-weight:600; }
  .badge { font-size:12px; font-weight:600; padding:3px 10px; border-radius:12px; text-transform:uppercase; }
  .badge.ok { background:rgba(63,185,80,.15); color:var(--green); }
  .badge.fail { background:rgba(248,81,73,.15); color:var(--red); }
  .badge.pending { background:rgba(210,153,34,.15); color:var(--yellow); }
  pre { margin:0; padding:16px 18px; font-size:13px; line-height:1.5; overflow-x:auto; font-family:'SF Mono',Monaco,Consolas,monospace; white-space:pre-wrap; word-break:break-word; max-height:500px; overflow-y:auto; }
  .meta { color:var(--muted); font-size:13px; padding:10px 18px; }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid var(--muted); border-top-color:var(--text); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<header>
  <h1>⛓️ Payment Processor Contracts</h1>
  <p>Limit Break — ERC721-C compatible payment processing layer · Foundry build &amp; test results</p>
</header>
<div class="container">
  <div class="card">
    <div class="card-header">
      <h2>Compilation (forge build)</h2>
      ${state.building ? '<span class="badge pending"><span class="spinner"></span> building</span>' : statusBadge(state.buildSuccess)}
    </div>
    ${state.buildOutput ? `<pre>${esc(state.buildOutput)}</pre>` : '<div class="meta">Waiting for first build…</div>'}
  </div>
  <div class="card">
    <div class="card-header">
      <h2>Tests (forge test)</h2>
      ${state.building ? '<span class="badge pending">queued</span>' : statusBadge(state.testSuccess)}
    </div>
    ${state.testOutput ? `<pre>${esc(state.testOutput)}</pre>` : '<div class="meta">Tests run after a successful build.</div>'}
  </div>
  <div class="meta">Last run: ${state.lastRun || "never"} · Fuzz runs reduced for preview (FOUNDRY_FUZZ_RUNS=256) · Gas benchmark tests excluded (OOG by design). Auto-refreshes every 5s.</div>
</div>
<script>setTimeout(()=>location.reload(),5000);</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(render());
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[serve] Listening on 0.0.0.0:${PORT}`);
  runBuildAndTest();
});

// Watch for .sol file changes and re-run
let debounce;
function watchDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "out" && entry.name !== "cache" && entry.name !== "forge-cache" && entry.name !== ".git") {
      watchDir(full);
    }
  }
}
try {
  fs.watch(APP_DIR, { recursive: true }, (event, file) => {
    if (!file) return;
    if ((file.endsWith(".sol") || file.endsWith(".toml")) && !file.startsWith("out/") && !file.startsWith("cache/") && !file.startsWith("forge-cache/") && !file.startsWith("broadcast/")) {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log("[serve] File changed: " + file + " — re-running");
        runBuildAndTest();
      }, 1500);
    }
  });
} catch (e) {
  console.log("[serve] fs.watch not supported, manual reload only");
}
