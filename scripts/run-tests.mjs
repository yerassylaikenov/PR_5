// Runs the Node.js test suites by category, saves per-category logs to
// reports/tests/ and a machine-readable summary for REPORT_DATA.md.
// Usage: node scripts/run-tests.mjs [integration|invariants|property|all]
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "reports/tests");
mkdirSync(OUT, { recursive: true });

const CATEGORIES = {
  integration: "test/integration",
  invariants: "test/invariants",
  property: "test/property",
};

function listTests(dir) {
  const abs = resolve(ROOT, dir);
  const out = [];
  for (const name of readdirSync(abs)) {
    const full = join(abs, name);
    if (statSync(full).isDirectory()) continue;
    if (name.endsWith(".test.ts")) out.push(join(dir, name).replaceAll("\\", "/"));
  }
  return out;
}

function stripNoise(s) {
  return s
    .split(/\r?\n/)
    .filter((l) => !/deprecated|getOrCreate|network\.create|^WARNING/.test(l))
    .join("\n");
}

function runCategory(cat) {
  const files = listTests(CATEGORIES[cat]);
  const res = spawnSync("npx", ["hardhat", "test", "nodejs", ...files], {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const log = stripNoise((res.stdout || "") + "\n" + (res.stderr || ""));
  writeFileSync(join(OUT, `${cat}.log`), log);
  const passing = Number((log.match(/(\d+)\s+passing/) || [])[1] || 0);
  const failing = Number((log.match(/(\d+)\s+failing/) || [])[1] || 0);
  const ok = res.status === 0 && failing === 0;
  console.log(
    `[${ok ? "PASS" : "FAIL"}] ${cat}: ${passing} passing, ${failing} failing (${files.length} files)`,
  );
  return { category: cat, files, passing, failing, ok };
}

const arg = (process.argv[2] || "all").toLowerCase();
const cats = arg === "all" ? Object.keys(CATEGORIES) : [arg];
const results = cats.map(runCategory);

writeFileSync(
  join(OUT, "summary.json"),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), results },
    null,
    2,
  ),
);

const allOk = results.every((r) => r.ok);
console.log(`\nTest summary written to reports/tests/summary.json — ${allOk ? "ALL GREEN" : "FAILURES PRESENT"}`);
process.exit(allOk ? 0 : 1);
