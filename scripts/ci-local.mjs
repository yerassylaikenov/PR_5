// Runs the same checks as the GitHub CI pipeline, locally and offline, saving a
// combined log to reports/ci/ci-local.log. Critical steps (compile, web build,
// tests) fail the run; Slither (may be absent) and npm audit are informational.
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "reports/ci");
mkdirSync(OUT, { recursive: true });
const LOG = resolve(OUT, "ci-local.log");
writeFileSync(LOG, `# ci:local — ${new Date().toISOString()}\n\n`);

const GREEN = "\x1b[32m", RED = "\x1b[41m\x1b[1m", YEL = "\x1b[33m", RST = "\x1b[0m";
let failed = false;

function step(name, cmd, args, { critical = true } = {}) {
  console.log(`\n\x1b[36m==> ${name}\x1b[0m`);
  appendFileSync(LOG, `\n===== ${name} =====\n$ ${cmd} ${args.join(" ")}\n`);
  const res = spawnSync(cmd, args, { cwd: process.cwd(), shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (res.stdout || "") + (res.stderr || "");
  appendFileSync(LOG, out + `\n[exit ${res.status}]\n`);
  const ok = res.status === 0;
  if (ok) console.log(`${GREEN}✔ ${name} PASS${RST}`);
  else if (critical) { console.log(`${RED} ✘ ${name} FAIL ${RST}`); failed = true; }
  else console.log(`${YEL}⚠ ${name} (informational, exit ${res.status})${RST}`);
  return ok;
}

step("Compile contract", "npx", ["hardhat", "compile"]);
step("Build web dApp", "npm", ["--prefix", "web", "run", "build"]);
step("Tests (integration + invariants + property)", "node", ["scripts/run-tests.mjs", "all"]);
step("Slither (static analysis)", "node", ["scripts/slither.mjs"], { critical: false });
step("Dependency audit", "node", ["scripts/run-audit.mjs"], { critical: false });
// Gate: high-level audit on the root project (no production vulns expected).
step("npm audit --audit-level=high (root)", "npm", ["audit", "--audit-level=high"], { critical: false });

console.log("");
if (failed) { console.log(`${RED} CI:LOCAL FAILED ${RST} — see reports/ci/ci-local.log`); process.exit(1); }
console.log(`${GREEN}✔ CI:LOCAL PASSED${RST} — log at reports/ci/ci-local.log`);
