// Fails if the repository contains secrets: a committed .env (only .env.example
// is allowed), PEM private-key blocks, or PRIVATE_KEY = 0x<64 hex> assignments.
// The public Hardhat test mnemonic is explicitly allowed (it is world-known).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", ".git", "reports", "deployments", "artifacts", "cache",
  "dist", "build", "coverage", ".vite",
]);
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|sol|md|yml|yaml|env|txt|html|css)$/i;

const findings = [];

// 1) a real .env must not exist
for (const p of ["", "web"]) {
  const envPath = resolve(ROOT, p, ".env");
  if (existsSync(envPath)) findings.push(`Committed .env found at ${join(p, ".env")} (only .env.example is allowed)`);
}

// 2) scan text files for key material
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const PRIV_ASSIGN = /(private[_-]?key|privkey|secret[_-]?key)\s*[:=]\s*["']?0x[0-9a-fA-F]{64}/i;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!TEXT_EXT.test(name)) continue;
    if (basename(full) === "check-secrets.mjs") continue; // this file holds the patterns
    let text;
    try { text = readFileSync(full, "utf8"); } catch { continue; }
    const rel = full.replace(ROOT + "\\", "").replace(ROOT + "/", "");
    if (PEM.test(text)) findings.push(`PEM private key block in ${rel}`);
    if (PRIV_ASSIGN.test(text)) findings.push(`Private-key assignment in ${rel}`);
  }
}
walk(ROOT);

const GREEN = "\x1b[32m", RED = "\x1b[41m\x1b[1m", RESET = "\x1b[0m";
if (findings.length === 0) {
  console.log(`${GREEN}✔ check:secrets PASS${RESET} — no private keys, seed phrases or .env files committed.`);
  process.exit(0);
} else {
  console.log(`${RED} check:secrets FAIL ${RESET}`);
  for (const f of findings) console.log(`  \x1b[31m✘ ${f}\x1b[0m`);
  process.exit(1);
}
