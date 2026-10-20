// Detection rules (requirement 6.2).
//
// IMPORTANT (methodology): events of REVERTED EVM transactions are NOT stored in
// the log (and on the local automine node a failing send is not even mined), so
// both rules are driven by TRANSACTION RECEIPTS and APPLICATION RECORDS, never by
// eth_getLogs.
//
// R-1 "Access-control violation attempt" (High): >= 3 access-denied signals from
//      ONE actor within 60s. Access-denied = decoded error in
//      {AccessControlUnauthorizedAccount, NotPaymentInitiator, SelfSettlementForbidden}.
// R-2 "Operational failure" (Medium): >= 2 other failures (out-of-gas,
//      InvalidStatusTransition, RPC errors/timeouts) within 120s.
import type { AlertSink } from "./alerts.ts";

export type Category = "event" | "receipt" | "app" | "rpc";
export type Outcome = "success" | "reverted" | "error";

export interface TelemetryRecord {
  ts: string; // ISO-8601
  correlationId: string;
  category: Category;
  source: string;
  actor: string;
  paymentId?: string;
  txHash?: string;
  blockNumber?: string;
  outcome: Outcome;
  errorName?: string;
  severity?: string;
}

const ACCESS_ERRORS = new Set([
  "AccessControlUnauthorizedAccount",
  "NotPaymentInitiator",
  "SelfSettlementForbidden",
]);

const R1_WINDOW_MS = 60_000;
const R1_THRESHOLD = 3;
const R2_WINDOW_MS = 120_000;
const R2_THRESHOLD = 2;

interface Hit {
  t: number;
  txHash: string;
  errorName: string;
}

export class RuleEngine {
  private r1 = new Map<string, Hit[]>(); // per-actor access-denied hits
  private r2: Hit[] = []; // global operational-failure hits

  constructor(private readonly alerts: AlertSink) {}

  ingest(rec: TelemetryRecord): void {
    if (rec.outcome === "success") return;
    const t = Date.parse(rec.ts);
    const err = rec.errorName ?? "Unknown";
    const hit: Hit = { t, txHash: rec.txHash ?? "-", errorName: err };

    if (ACCESS_ERRORS.has(err)) {
      const actor = rec.actor.toLowerCase();
      const arr = (this.r1.get(actor) ?? []).filter((h) => t - h.t <= R1_WINDOW_MS);
      arr.push(hit);
      this.r1.set(actor, arr);
      if (arr.length >= R1_THRESHOLD) {
        this.alerts.fire({
          rule: "R-1",
          severity: "High",
          actor,
          ts: rec.ts,
          windowSeconds: 60,
          count: arr.length,
          txHashes: arr.map((h) => h.txHash),
          lastError: err,
          message: `>=${R1_THRESHOLD} access-control violation attempts from ${actor} within 60s`,
        });
      }
    } else {
      this.r2 = this.r2.filter((h) => t - h.t <= R2_WINDOW_MS);
      this.r2.push(hit);
      if (this.r2.length >= R2_THRESHOLD) {
        this.alerts.fire({
          rule: "R-2",
          severity: "Medium",
          actor: rec.actor.toLowerCase(),
          ts: rec.ts,
          windowSeconds: 120,
          count: this.r2.length,
          txHashes: this.r2.map((h) => h.txHash),
          lastError: err,
          message: `>=${R2_THRESHOLD} operational failures within 120s (last: ${err})`,
        });
      }
    }
  }
}
