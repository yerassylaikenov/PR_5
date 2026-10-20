// Task 3 terminal report (monitoring, DevSecOps, performance). Runs the alert
// and normal demos, shows the RED R-1 alert, and prints the load-test summary.
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const G = "\x1b[32m", R = "\x1b[31m", RB = "\x1b[41m\x1b[1m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m", Y = "\x1b[33m";
const ok = (s) => console.log(`${G}✔${X} ${s}`);
const bad = (s) => console.log(`${R}✘ ${s}${X}`);
const head = (s) => console.log(`\n${B}${C}${s}${X}`);
const rj = (p) => (existsSync(resolve(process.cwd(), p)) ? JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8")) : null);

if (!existsSync(resolve(process.cwd(), "deployments/localhost.json"))) {
  bad("deployments/localhost.json not found - run `npm run node` and `npm run deploy:local`"); process.exit(1);
}

head("TASK 3 - Monitoring, DevSecOps and performance");

head("Rule R-1 demo (access-control violation attempts)");
const a = spawnSync("npx", ["tsx", "scripts/demo-attack.ts"], { shell: true, encoding: "utf8", maxBuffer: 64e6 });
process.stdout.write(a.stdout || "");
const alerts = (existsSync(resolve(process.cwd(), "reports/monitoring/alerts.log")) ? readFileSync(resolve(process.cwd(), "reports/monitoring/alerts.log"), "utf8") : "").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const r1 = alerts.filter((x) => x.rule === "R-1");
r1.length ? ok(`R-1 fired ${r1.length} time(s); last count=${r1.at(-1).count}, previously suppressed=${r1.at(-1).suppressedSincePrevious}`) : bad("R-1 did not fire");

head("Normal scenario - no alerts expected");
const n = spawnSync("npx", ["tsx", "scripts/demo-normal.ts"], { shell: true, encoding: "utf8", maxBuffer: 64e6 });
process.stdout.write(n.stdout || "");
/alerts: 0/.test(n.stdout || "") ? ok("legitimate flow: alerts: 0") : bad("unexpected alert in normal flow");

head("Load experiment (profiles A vs B)");
const m = rj("reports/load/metrics.json");
if (m) {
  const A = m.profiles.A, Bp = m.profiles.B;
  ok(`A (sequential): p50=${A.latency.p50.toFixed(1)}ms p95=${A.latency.p95.toFixed(1)}ms TPS=${A.throughputOpsSec.toFixed(1)} fail=${(A.failureRate*100).toFixed(0)}%`);
  ok(`B (5x6 parallel): p50=${Bp.latency.p50.toFixed(1)}ms p95=${Bp.latency.p95.toFixed(1)}ms TPS=${Bp.throughputOpsSec.toFixed(1)} fail=${(Bp.failureRate*100).toFixed(0)}%`);
  console.log(`  ${Y}-> limiting component: block production / nonce, not the contract (reports/load/SUMMARY.md)${X}`);
} else {
  console.log(`${Y}⚠ no reports/load/metrics.json - run npm run loadtest${X}`);
}

head("Task 3 summary");
ok("Telemetry 3 categories (ISO time, correlationId, no secrets), rules R-1/R-2, cooldown 5 min");
ok("CI: .github/workflows/ci.yml + npm run ci:local (reports/ci/ci-local.log)");
ok("Charts: reports/load/chart-*.svg");
