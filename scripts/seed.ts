// Seeds 3 synthetic demo payments so the dApp event feed is populated on start.
// Run after deploy: npm run seed
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toHex, toBytes } from "viem";
import { loadDeployment } from "./lib/deployment.ts";

function fileDocHash(name: string) {
  const bytes = readFileSync(resolve(process.cwd(), "demo-data", name));
  return keccak256(new Uint8Array(bytes));
}

async function main() {
  const dep = loadDeployment();
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [, operator, settlement] = await viem.getWalletClients();
  const contract = { address: dep.address, abi: dep.abi } as const;

  const orders = [
    { id: "PR5-OP-2026-000001", file: "order-001.xml", amount: 150000000n },
    { id: "PR5-OP-2026-000002", file: "order-002.xml", amount: 49990000n },
    { id: "PR5-OP-2026-000003", file: "order-003.xml", amount: 1000000n },
  ];

  const sent: Record<string, `0x${string}`> = {};
  for (const o of orders) {
    const paymentId = keccak256(toHex(o.id));
    const docHash = fileDocHash(o.file);
    const hash = await operator.writeContract({
      ...contract,
      functionName: "registerPayment",
      args: [paymentId, docHash, o.amount],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    sent[o.id] = paymentId;
    console.log(`registered ${o.id} (${paymentId.slice(0, 10)}...) tx=${hash.slice(0, 12)}...`);
  }

  // Execute order 1 (settlement != operator -> four-eyes OK).
  const execHash = await settlement.writeContract({
    ...contract,
    functionName: "markExecuted",
    args: [sent["PR5-OP-2026-000001"]],
  });
  await publicClient.waitForTransactionReceipt({ hash: execHash });
  console.log(`markExecuted order 1 tx=${execHash.slice(0, 12)}...`);

  // Reject order 2 with ISO 20022 reason code AC04.
  const rejHash = await settlement.writeContract({
    ...contract,
    functionName: "markRejected",
    args: [sent["PR5-OP-2026-000002"], toHex("AC04", { size: 32 })],
  });
  await publicClient.waitForTransactionReceipt({ hash: rejHash });
  console.log(`markRejected order 2 (AC04) tx=${rejHash.slice(0, 12)}...`);

  const total = await publicClient.readContract({
    ...contract,
    functionName: "totalRegistered",
  });
  console.log(`\nSeed done. totalRegistered=${total}. Order 3 left Registered for the live demo.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
