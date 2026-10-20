// Latency/throughput/gas metrics for the load test.
// p50/p95 use the NEAREST-RANK method: rank = ceil(p/100 * N), 1-indexed, on the
// ascending-sorted sample (documented in reports/load/SUMMARY.md and README).

export interface TxResult {
  index: number;
  account: string;
  paymentId: string;
  txHash: string | null;
  nonce: number;
  latencyMs: number;
  gasUsed: number;
  status: "success" | "reverted" | "error";
}

export function percentileNearestRank(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.min(rank, sortedAsc.length) - 1];
}

function median(sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  return n % 2 ? sortedAsc[(n - 1) / 2] : (sortedAsc[n / 2 - 1] + sortedAsc[n / 2]) / 2;
}

export interface ProfileSummary {
  profile: string;
  totalTx: number;
  successful: number;
  failed: number;
  failureRate: number;
  wallTimeMs: number;
  throughputOpsSec: number;
  latency: { p50: number; p95: number; min: number; max: number };
  gasUsed: { min: number; median: number; max: number; sum: number };
}

export function summarize(
  profile: string,
  results: TxResult[],
  wallTimeMs: number,
): ProfileSummary {
  const ok = results.filter((r) => r.status === "success");
  const latSorted = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
  const gasSorted = ok.map((r) => r.gasUsed).sort((a, b) => a - b);
  const failed = results.length - ok.length;
  return {
    profile,
    totalTx: results.length,
    successful: ok.length,
    failed,
    failureRate: results.length ? failed / results.length : 0,
    wallTimeMs,
    throughputOpsSec: wallTimeMs ? (ok.length / wallTimeMs) * 1000 : 0,
    latency: {
      p50: percentileNearestRank(latSorted, 50),
      p95: percentileNearestRank(latSorted, 95),
      min: latSorted[0] ?? 0,
      max: latSorted[latSorted.length - 1] ?? 0,
    },
    gasUsed: {
      min: gasSorted[0] ?? 0,
      median: median(gasSorted),
      max: gasSorted[gasSorted.length - 1] ?? 0,
      sum: gasSorted.reduce((a, b) => a + b, 0),
    },
  };
}

export function toCsv(results: TxResult[]): string {
  const header = "index,account,paymentId,txHash,nonce,latencyMs,gasUsed,status";
  const rows = results.map(
    (r) =>
      `${r.index},${r.account},${r.paymentId},${r.txHash ?? ""},${r.nonce},${r.latencyMs.toFixed(2)},${r.gasUsed},${r.status}`,
  );
  return [header, ...rows].join("\n") + "\n";
}
