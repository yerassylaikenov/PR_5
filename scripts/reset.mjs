// Resets local runtime state: deployment descriptors, monitor cooldown state and
// monitoring logs. Use after restarting the Hardhat node.
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const targets = [
  "deployments/localhost.json",
  "web/public/deployment.json",
  "monitor/state.json",
  "reports/monitoring/telemetry.jsonl",
  "reports/monitoring/alerts.log",
  "reports/monitoring/alert-triggered.log",
  "reports/monitoring/no-alert.log",
  "reports/monitoring/.state-demo-attack.json",
  "reports/monitoring/.state-demo-normal.json",
  "reports/monitoring/.alerts-demo-normal.log",
];
for (const t of targets) {
  rmSync(resolve(ROOT, t), { force: true });
  console.log(`removed ${t}`);
}
console.log("\x1b[32m✔ reset done\x1b[0m — redeploy with `npm run deploy:local` && `npm run seed`.");
