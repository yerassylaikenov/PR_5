// Load experiment (requirement 6.5), viem + local Hardhat accounts, NO MetaMask.
// Profile A: 30 sequential registerPayment from ONE account.
// Profile B: 30 total = 5 parallel clients x 6 tx, each client its OWN account.
//
// Nonce: fetched once per account (pending), then incremented locally and passed
// explicitly. Unique paymentId per tx. Same gasPrice for every tx. 3 warmup tx
// per profile are not counted. Start block is recorded per profile.
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createPublicClient, createWalletClient, http, keccak256, toHex, type Hex,
} from "viem";
import { localChain, RPC_URL, testAccount } from "../scripts/lib/accounts.ts";
import { loadDeployment } from "../scripts/lib/deployment.ts";
import { OPERATOR_ROLE } from "../scripts/lib/roles.ts";
import { summarize, toCsv, type TxResult, type ProfileSummary } from "./metrics.ts";

const OUT = resolve(process.cwd(), "reports/load");
mkdirSync(OUT, { recursive: true });

const dep = loadDeployment();
const pub = createPublicClient({ chain: localChain, transport: http(RPC_URL) });

function walletFor(index: number) {
  return createWalletClient({ account: testAccount(index), chain: localChain, transport: http(RPC_URL) });
}

async function ensureOperator(adminWallet: ReturnType<typeof walletFor>, addr: Hex) {
  // Idempotent: grantRole is a no-op if the account already holds the role.
  const hash = await adminWallet.writeContract({
    address: dep.address, abi: dep.abi, functionName: "grantRole", args: [OPERATOR_ROLE, addr],
  });
  await pub.waitForTransactionReceipt({ hash });
}

async function sendRegister(
  wallet: ReturnType<typeof walletFor>, label: string, nonce: number, gasPrice: bigint, index: number,
): Promise<TxResult> {
  const account = wallet.account!.address.toLowerCase();
  const paymentId = keccak256(toHex(label));
  const docHash = keccak256(toHex("doc:" + label));
  const t0 = performance.now();
  try {
    const hash = await wallet.writeContract({
      address: dep.address, abi: dep.abi, functionName: "registerPayment",
      args: [paymentId, docHash, 1000n], nonce, gasPrice,
    });
    const rc = await pub.waitForTransactionReceipt({ hash });
    const latencyMs = performance.now() - t0;
    return {
      index, account, paymentId, txHash: hash, nonce, latencyMs,
      gasUsed: Number(rc.gasUsed), status: rc.status === "success" ? "success" : "reverted",
    };
  } catch {
    return { index, account, paymentId, txHash: null, nonce, latencyMs: performance.now() - t0, gasUsed: 0, status: "error" };
  }
}

async function warmup(wallet: ReturnType<typeof walletFor>, gasPrice: bigint) {
  let nonce = await pub.getTransactionCount({ address: wallet.account!.address, blockTag: "pending" });
  for (let i = 0; i < 3; i++) {
    await sendRegister(wallet, `warmup-${wallet.account!.address}-${i}-${Date.now()}`, nonce++, gasPrice, -1);
  }
}

async function profileA(gasPrice: bigint): Promise<{ summary: ProfileSummary; results: TxResult[]; startBlock: bigint }> {
  const w = walletFor(1);
  await warmup(w, gasPrice);
  const startBlock = await pub.getBlockNumber();
  let nonce = await pub.getTransactionCount({ address: w.account!.address, blockTag: "pending" });
  const results: TxResult[] = [];
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) {
    results.push(await sendRegister(w, `A-${i}-${Date.now()}`, nonce++, gasPrice, i));
  }
  const wall = performance.now() - t0;
  return { summary: summarize("A (sequential, 1 account)", results, wall), results, startBlock };
}

async function profileB(gasPrice: bigint): Promise<{ summary: ProfileSummary; results: TxResult[]; startBlock: bigint }> {
  const clientIdx = [4, 5, 6, 7, 8];
  const admin = walletFor(0);
  for (const idx of clientIdx) await ensureOperator(admin, testAccount(idx).address);
  const wallets = clientIdx.map(walletFor);
  for (const w of wallets) await warmup(w, gasPrice);

  const startBlock = await pub.getBlockNumber();
  const nonces = await Promise.all(
    wallets.map((w) => pub.getTransactionCount({ address: w.account!.address, blockTag: "pending" })),
  );

  const t0 = performance.now();
  const perClient = await Promise.all(
    wallets.map(async (w, ci) => {
      let nonce = nonces[ci];
      const out: TxResult[] = [];
      for (let j = 0; j < 6; j++) {
        out.push(await sendRegister(w, `B-${ci}-${j}-${Date.now()}`, nonce++, gasPrice, ci * 6 + j));
      }
      return out;
    }),
  );
  const wall = performance.now() - t0;
  const results = perClient.flat();
  return { summary: summarize("B (5 parallel clients x 6)", results, wall), results, startBlock };
}

function writeProfile(name: "A" | "B", data: { summary: ProfileSummary; results: TxResult[]; startBlock: bigint }) {
  writeFileSync(resolve(OUT, `raw-${name}.json`), JSON.stringify({ startBlock: data.startBlock.toString(), summary: data.summary, results: data.results }, null, 2));
  writeFileSync(resolve(OUT, `raw-${name}.csv`), toCsv(data.results));
}

async function main() {
  const gasPrice = await pub.getGasPrice();
  console.log(`[loadtest] contract=${dep.address} gasPrice=${gasPrice} (fixed for all tx)`);
  console.log("[loadtest] mining mode: Hardhat automine (default) — 1 tx per block");

  const a = await profileA(gasPrice);
  console.log(`[loadtest] Profile A done: p50=${a.summary.latency.p50.toFixed(1)}ms p95=${a.summary.latency.p95.toFixed(1)}ms tps=${a.summary.throughputOpsSec.toFixed(1)}`);
  writeProfile("A", a);

  const b = await profileB(gasPrice);
  console.log(`[loadtest] Profile B done: p50=${b.summary.latency.p50.toFixed(1)}ms p95=${b.summary.latency.p95.toFixed(1)}ms tps=${b.summary.throughputOpsSec.toFixed(1)}`);
  writeProfile("B", b);

  writeFileSync(resolve(OUT, "metrics.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    gasPrice: gasPrice.toString(),
    miningMode: "automine",
    profiles: { A: a.summary, B: b.summary },
  }, null, 2));
  console.log("[loadtest] wrote reports/load/{raw-A,raw-B}.{json,csv} and metrics.json");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
