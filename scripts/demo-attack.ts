// demo:alert — an account WITHOUT a role repeatedly tries a privileged
// operation. Each attempt reverts (AccessControlUnauthorizedAccount), which is
// reported as an application record. Rule R-1 fires ONCE; subsequent hits are
// suppressed by the 5-minute cooldown. Transcript -> reports/monitoring/alert-triggered.log.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, keccak256, toHex } from "viem";
import { localChain, RPC_URL, roleAccount } from "./lib/accounts.ts";
import { loadDeployment } from "./lib/deployment.ts";
import { decodeRevert } from "./lib/errors.ts";
import { createTee, red, cyan, bold, cross } from "./lib/tee.ts";
import { AlertSink } from "../monitor/alerts.ts";
import { RuleEngine, type TelemetryRecord } from "../monitor/rules.ts";

const MONITOR = `http://127.0.0.1:${process.env.MONITOR_PORT ?? 8787}/log`;
const ATTEMPTS = 5; // >3 so we see one alert + suppressed hits
const STATE = resolve(process.cwd(), "reports/monitoring/.state-demo-attack.json");

async function postToMonitor(rec: TelemetryRecord) {
  try {
    await fetch(MONITOR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    /* live monitor optional */
  }
}

async function main() {
  rmSync(STATE, { force: true }); // clean cooldown for a reproducible demo
  const tee = createTee(resolve(process.cwd(), "reports/monitoring/alert-triggered.log"));
  const dep = loadDeployment();
  const outsider = roleAccount("outsider");
  const pub = createPublicClient({ chain: localChain, transport: http(RPC_URL) });

  const sink = new AlertSink({
    statePath: STATE,
    alertsLogPath: resolve(process.cwd(), "reports/monitoring/alerts.log"),
    emit: tee.log,
  });
  const engine = new RuleEngine(sink);

  tee.log(bold(cyan("=== demo:alert - R-1 access-control violation attempts ===")));
  tee.log(`contract=${dep.address}`);
  tee.log(`attacker (no role)=${outsider.address}`);
  tee.log(`rule R-1: >=3 access-denied from one actor within 60s -> High (cooldown 5 min)\n`);

  const docHash = keccak256(toHex("attack-doc"));
  for (let i = 1; i <= ATTEMPTS; i++) {
    const paymentId = keccak256(toHex(`attack-${i}`));
    const correlationId = `attack-${Date.now()}-${i}`;
    try {
      await pub.simulateContract({
        address: dep.address,
        abi: dep.abi,
        functionName: "registerPayment",
        args: [paymentId, docHash, 1n],
        account: outsider.address,
      });
      tee.log(`attempt ${i}: unexpected success (should not happen)`);
    } catch (e) {
      const d = decodeRevert(e);
      tee.log(`${cross} attempt ${i}: ${red("REVERTED")} ${red(d.errorName)}  (simulateContract)`);
      const rec: TelemetryRecord = {
        ts: new Date().toISOString(),
        correlationId,
        category: "app",
        source: "demo-attack",
        actor: outsider.address,
        paymentId,
        outcome: "reverted",
        errorName: d.errorName,
        severity: "high",
      };
      engine.ingest(rec); // local detection -> alerts.log + console
      await postToMonitor(rec); // live monitor (if running)
    }
  }

  tee.log(`\n${bold("Result:")} 1 alert emitted for R-1, remaining matches suppressed by cooldown.`);
  tee.log("See reports/monitoring/alerts.log for the structured alert record.");
  await tee.close();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
