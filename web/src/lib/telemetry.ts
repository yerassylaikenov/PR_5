// Application telemetry to the monitor (requirement 6.1). A correlationId is
// generated when an operation starts and threads through every record. NO
// secrets, keys, seed phrases or document contents are ever sent — only hashes
// and identifiers.
import { MONITOR_URL } from "./contract";

export function newCorrelationId(): string {
  return "dapp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export interface AppLog {
  correlationId: string;
  category?: "app";
  source?: string;
  actor: string;
  paymentId?: string;
  txHash?: string;
  blockNumber?: string;
  outcome: "success" | "reverted" | "error";
  errorName?: string;
  severity?: string;
}

export async function sendLog(log: AppLog): Promise<void> {
  try {
    await fetch(MONITOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "app", source: "dapp", ...log }),
      signal: AbortSignal.timeout(1200),
    });
  } catch {
    // Monitor is optional for the dApp to function.
  }
}
