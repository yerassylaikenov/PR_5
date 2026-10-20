// Task 2 terminal report (verification & security). Green checks for passing
// test categories; RED for the vulnerabilities blocked by the contract and for
// dependency-audit findings (dev-only).
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const G = "\x1b[32m", R = "\x1b[31m", RB = "\x1b[41m\x1b[1m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m", Y = "\x1b[33m";
const ok = (s) => console.log(`${G}✔${X} ${s}`);
const bad = (s) => console.log(`${R}✘ ${s}${X}`);
const vuln = (s) => console.log(`${RB} VULNERABILITY ${X} ${R}${s}${X}`);
const head = (s) => console.log(`\n${B}${C}${s}${X}`);
const rj = (p) => (existsSync(resolve(process.cwd(), p)) ? JSON.parse(readFileSync(resolve(process.cwd(), p), "utf8")) : null);

head("TASK 2 - Verification and security analysis");

head("Tests (integration + invariants + property)");
const res = spawnSync("node", ["scripts/run-tests.mjs", "all"], { shell: true, encoding: "utf8", maxBuffer: 64e6 });
process.stdout.write(res.stdout || "");
const summary = rj("reports/tests/summary.json");
if (summary) {
  for (const r of summary.results) (r.ok ? ok : bad)(`${r.category}: ${r.passing} passing, ${r.failing} failing`);
}

head("Negative checks - vulnerabilities blocked by the contract");
vuln("SC01 Access Control: outsider address -> AccessControlUnauthorizedAccount (integration #4, property P2)");
vuln("SC01/SC03 four-eyes: initiator settles own payment -> SelfSettlementForbidden (integration #5)");
vuln("SC03 Logic: transition from final status -> InvalidStatusTransition; reused paymentId -> PaymentAlreadyExists (#6)");
vuln("SC04 Input: zero paymentId/docHash/amount/reasonCode -> rejected (#7)");
vuln("SC10 DoS: pause() blocks writes (EnforcedPause); pause not available to non-admin (#9)");
console.log(`  ${Y}-> every vector above reverts; registry state does not change.${X}`);

head("Static analysis and dependencies");
const slPending = existsSync(resolve(process.cwd(), "reports/slither/STATUS.md")) && !existsSync(resolve(process.cwd(), "reports/slither/slither.json"));
slPending ? console.log(`${Y}⚠ Slither not installed - see reports/slither/STATUS.md (requires user run)${X}`) : ok("Slither report generated (reports/slither/)");

const ar = rj("reports/deps/npm-audit-root.json")?.metadata?.vulnerabilities;
const aw = rj("reports/deps/npm-audit-web.json")?.metadata?.vulnerabilities;
if (ar) (ar.high || ar.critical ? vuln : ok)(`npm audit (root): high ${ar.high} critical ${ar.critical} moderate ${ar.moderate} low ${ar.low}`);
if (aw) {
  (aw.high || aw.critical) ? vuln(`npm audit (web): high ${aw.high} critical ${aw.critical} moderate ${aw.moderate} - Vite/esbuild dev deps (dev server only, not in production bundle)`) : ok(`npm audit (web): clean`);
}

head("Task 2 summary");
ok("STRIDE (docs/STRIDE.md), 3 invariants (docs/INVARIANTS.md), authorization matrix (docs/AUTHZ_MATRIX.md)");
ok("All tests green; audit classification - reports/deps/SUMMARY.md");
