// demo:normal — a legitimate flow (register -> markExecuted -> verifyDocument)
// by the proper roles. No rule fires. Transcript -> reports/monitoring/no-alert.log
// with an explicit "alerts: 0" line.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, toHex } from "viem";
import { localChain, RPC_URL, roleAccount } from "./lib/accounts.ts";
import { loadDeployment } from "./lib/deployment.ts";
import { createTee, green, cyan, bold, check } from "./lib/tee.ts";
import { AlertSink } from "../monitor/alerts.ts";
import { RuleEngine, type TelemetryRecord } from "../monitor/rules.ts";

const MONITOR = `http://127.0.0.1:${process.env.MONITOR_PORT ?? 8787}/log`;
const STATE = resolve(process.cwd(), "reports/monitoring/.state-demo-normal.json");

async function postToMonitor(rec: TelemetryRecord) {
  try {
    await fetch(MONITOR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec),
      signal: AbortSignal.timeout(1000),
    });
  } catch { /* optional */ }
}

async function main() {
  rmSync(STATE, { force: true });
  const tee = createTee(resolve(process.cwd(), "reports/monitoring/no-alert.log"));
  const dep = loadDeployment();
  const pub = createPublicClient({ chain: localChain, transport: http(RPC_URL) });
  const operator = roleAccount("operator");
  const settlement = roleAccount("settlement");
  const opWallet = createWalletClient({ account: operator, chain: localChain, transport: http(RPC_URL) });
  const setWallet = createWalletClient({ account: settlement, chain: localChain, transport: http(RPC_URL) });

  let alerts = 0;
  const sink = new AlertSink({
    statePath: STATE,
    alertsLogPath: resolve(process.cwd(), "reports/monitoring/.alerts-demo-normal.log"),
    emit: (line) => { alerts++; tee.log(line); },
  });
  const engine = new RuleEngine(sink);

  tee.log(bold(cyan("=== demo:normal — legitimate register -> markExecuted -> verifyDocument ===")));
  tee.log(`contract=${dep.address}\n`);

  const label = `normal-${Date.now()}`;
  const paymentId = keccak256(toHex(label));
  const docHash = keccak256(toHex("doc:" + label));
  const correlationId = `normal-${Date.now()}`;

  // 1) register (operator)
  const regHash = await opWallet.writeContract({
    address: dep.address, abi: dep.abi, functionName: "registerPayment",
    args: [paymentId, docHash, 123456n],
  });
  const regRc = await pub.waitForTransactionReceipt({ hash: regHash });
  tee.log(`${check} ${green("registerPayment")} tx=${regHash.slice(0, 12)}... block=${regRc.blockNumber} gasUsed=${regRc.gasUsed}`);
  const recReg: TelemetryRecord = { ts: new Date().toISOString(), correlationId, category: "app", source: "demo-normal", actor: operator.address, paymentId, txHash: regHash, blockNumber: regRc.blockNumber.toString(), outcome: "success" };
  engine.ingest(recReg); await postToMonitor(recReg);

  // 2) markExecuted (settlement != operator -> four-eyes OK)
  const exHash = await setWallet.writeContract({
    address: dep.address, abi: dep.abi, functionName: "markExecuted", args: [paymentId],
  });
  const exRc = await pub.waitForTransactionReceipt({ hash: exHash });
  tee.log(`${check} ${green("markExecuted")}   tx=${exHash.slice(0, 12)}... block=${exRc.blockNumber} gasUsed=${exRc.gasUsed}`);
  const recEx: TelemetryRecord = { ts: new Date().toISOString(), correlationId, category: "app", source: "demo-normal", actor: settlement.address, paymentId, txHash: exHash, blockNumber: exRc.blockNumber.toString(), outcome: "success" };
  engine.ingest(recEx); await postToMonitor(recEx);

  // 3) verifyDocument (read)
  const ok = await pub.readContract({ address: dep.address, abi: dep.abi, functionName: "verifyDocument", args: [paymentId, docHash] });
  tee.log(`${check} ${green("verifyDocument")} -> ${ok}`);

  tee.log(`\n${bold("alerts: " + alerts)}  (expected 0 for the legitimate scenario)`);
  await tee.close();
  process.exit(alerts === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
