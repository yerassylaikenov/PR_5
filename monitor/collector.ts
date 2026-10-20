// Telemetry collector + detector (requirement 6.1-6.2). Runs next to the dApp.
//
// Categories collected:
//   1) event   — contract events (PaymentRegistered/PaymentStatusChanged/
//                 RoleGranted/Paused), decoded from mined receipts.
//   2) receipt — transaction receipts to our contract (status/gasUsed/block/from).
//   3) app/rpc — application records POSTed by the dApp/demo scripts over HTTP
//                 (port 8787), and RPC errors/timeouts from block polling.
//
// Every record: { ts(ISO-8601), correlationId, category, source, actor,
//   paymentId, txHash, blockNumber, outcome, errorName, severity }.
// Secrets, keys, seed phrases and document contents are NEVER logged — only
// hashes and identifiers. Failed-access detection uses receipts + application
// records, NOT eth_getLogs (reverted-tx events are not in the log).
import { createServer } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, parseEventLogs, type Hex } from "viem";
import { localChain, RPC_URL } from "../scripts/lib/accounts.ts";
import { loadDeployment } from "../scripts/lib/deployment.ts";
import { RuleEngine, type TelemetryRecord } from "./rules.ts";
import { AlertSink } from "./alerts.ts";

const PORT = Number(process.env.MONITOR_PORT ?? 8787);
const TELEMETRY = resolve(process.cwd(), "reports/monitoring/telemetry.jsonl");
mkdirSync(resolve(process.cwd(), "reports/monitoring"), { recursive: true });

const ALLOWED_FIELDS = [
  "correlationId", "category", "source", "actor", "paymentId",
  "txHash", "blockNumber", "outcome", "errorName", "severity",
] as const;

const dep = loadDeployment();
const address = dep.address.toLowerCase();
const publicClient = createPublicClient({
  chain: localChain,
  transport: http(RPC_URL, { timeout: 10_000 }),
  pollingInterval: 500,
});

const sink = new AlertSink();
const engine = new RuleEngine(sink);

function write(rec: TelemetryRecord) {
  appendFileSync(TELEMETRY, JSON.stringify(rec) + "\n");
  engine.ingest(rec);
}

function now() {
  return new Date().toISOString();
}

// ---- Category 1 & 2: block polling -> receipts + decoded events ----
async function processBlock(blockNumber: bigint) {
  const block = await publicClient.getBlock({ blockNumber, includeTransactions: true });
  for (const tx of block.transactions) {
    if (typeof tx === "string") continue;
    if ((tx.to ?? "").toLowerCase() !== address) continue;
    const receipt = await publicClient.getTransactionReceipt({ hash: tx.hash });
    const outcome = receipt.status === "success" ? "success" : "reverted";

    write({
      ts: now(),
      correlationId: `chain:${tx.hash}`,
      category: "receipt",
      source: "chain",
      actor: tx.from.toLowerCase(),
      txHash: tx.hash,
      blockNumber: receipt.blockNumber.toString(),
      outcome,
      errorName: outcome === "reverted" ? "ExecutionReverted" : undefined,
      severity: "info",
    });

    const logs = parseEventLogs({ abi: dep.abi, logs: receipt.logs });
    for (const log of logs) {
      const args = log.args as Record<string, unknown>;
      write({
        ts: now(),
        correlationId: `chain:${tx.hash}`,
        category: "event",
        source: "chain",
        actor: tx.from.toLowerCase(),
        paymentId: (args.paymentId as Hex) ?? undefined,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber.toString(),
        outcome: "success",
        errorName: log.eventName,
        severity: "info",
      });
    }
  }
}

let lastProcessed = 0n;
async function pollLoop() {
  try {
    const tip = await publicClient.getBlockNumber();
    while (lastProcessed < tip) {
      lastProcessed += 1n;
      await processBlock(lastProcessed);
    }
  } catch (err) {
    // Category 3: RPC error/timeout -> operational-failure signal (R-2).
    write({
      ts: now(),
      correlationId: `rpc:${Date.now()}`,
      category: "rpc",
      source: "collector",
      actor: "rpc",
      outcome: "error",
      errorName: err instanceof Error ? err.name || "RpcError" : "RpcError",
      severity: "warn",
    });
  }
}

// ---- Category 3: application records over HTTP ----
function startHttp() {
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, contract: dep.address }));
    }
    if (req.method === "POST" && req.url === "/log") {
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        try {
          const raw = JSON.parse(body || "{}");
          const rec: any = { ts: now(), category: "app", source: "dapp", actor: "unknown", outcome: "success" };
          for (const f of ALLOWED_FIELDS) if (raw[f] !== undefined) rec[f] = raw[f];
          if (typeof rec.actor === "string") rec.actor = rec.actor.toLowerCase();
          write(rec as TelemetryRecord);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400); res.end("bad request");
        }
      });
      return;
    }
    res.writeHead(404); res.end("not found");
  });
  server.listen(PORT, () => {
    console.log(`\x1b[36m[monitor]\x1b[0m application-log endpoint on http://127.0.0.1:${PORT}/log`);
  });
}

console.log(`\x1b[32m[monitor] started\x1b[0m contract=${dep.address} rpc=${RPC_URL}`);
console.log(`[monitor] telemetry -> reports/monitoring/telemetry.jsonl, alerts -> reports/monitoring/alerts.log`);
console.log(`[monitor] rules: R-1 (>=3 access-denied/60s, High), R-2 (>=2 operational failures/120s, Medium)`);
startHttp();
publicClient.getBlockNumber().then((n) => { lastProcessed = n; });
const timer = setInterval(pollLoop, 500);
process.on("SIGINT", () => { clearInterval(timer); console.log("\n[monitor] stopped"); process.exit(0); });
