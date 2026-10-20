// One-command re-check before the defense: runs tests, the monitoring demos and
// the load test, and refreshes reports/. Starts a local Hardhat node if one is
// not already running (and stops only the node it started).
import { spawn, spawnSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpcUp() {
  try {
    const r = await fetch("http://127.0.0.1:8545", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", id: 1 }),
      signal: AbortSignal.timeout(1500),
    });
    const j = await r.json();
    return j.result === "0x7a69";
  } catch { return false; }
}

function run(title, cmd, args) {
  console.log(`\n\x1b[36m==> ${title}\x1b[0m`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) console.log(`\x1b[33m(step "${title}" exited ${r.status})\x1b[0m`);
  return r.status === 0;
}

async function main() {
  let started = false, child = null;
  if (!(await rpcUp())) {
    console.log("\x1b[36m==> starting local Hardhat node\x1b[0m");
    child = spawn("npx", ["hardhat", "node"], { shell: true, stdio: "ignore" });
    started = true;
    for (let i = 0; i < 40 && !(await rpcUp()); i++) await sleep(500);
    if (!(await rpcUp())) { console.error("node did not start"); process.exit(1); }
  } else {
    console.log("\x1b[36m==> using already-running node on :8545\x1b[0m");
  }

  run("Deploy + grant roles", "npx", ["hardhat", "run", "scripts/deploy.ts", "--network", "localhost"]);
  run("Seed demo payments", "npx", ["hardhat", "run", "scripts/seed.ts", "--network", "localhost"]);
  run("Tests", "node", ["scripts/run-tests.mjs", "all"]);
  run("Monitoring demo — alert (R-1)", "npx", ["tsx", "scripts/demo-attack.ts"]);
  run("Monitoring demo — normal (no alert)", "npx", ["tsx", "scripts/demo-normal.ts"]);
  run("Load test A/B + charts", "npx", ["tsx", "loadtest/run.ts"]) && run("Charts", "node", ["loadtest/charts.mjs"]);
  run("Collect report data", "node", ["scripts/collect-report-data.mjs"]);

  if (started && child?.pid) {
    console.log("\x1b[36m==> stopping the node we started\x1b[0m");
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: true });
    else child.kill();
  }
  console.log("\n\x1b[32m✔ demo:all finished — reports/ updated\x1b[0m");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
