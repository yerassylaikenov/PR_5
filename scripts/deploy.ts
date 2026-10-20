// Deploys PaymentOrderRegistry to the local Hardhat node and grants the
// OPERATOR_ROLE / SETTLEMENT_ROLE to the fixed demo accounts.
// Writes a deployment descriptor (with ABI) for the dApp and the scripts.
//
// Run: npm run deploy:local   (requires `npm run node` in another terminal)
import { network } from "hardhat";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { OPERATOR_ROLE, SETTLEMENT_ROLE } from "./lib/roles.ts";

const ARTIFACT = resolve(
  process.cwd(),
  "artifacts/contracts/PaymentOrderRegistry.sol/PaymentOrderRegistry.json",
);

async function main() {
  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  const [admin, operator, settlement] = wallets;

  console.log("Deployer (admin):", admin.account.address);
  console.log("Operator        :", operator.account.address);
  console.log("Settlement      :", settlement.account.address);

  // 1) Deploy (constructor: admin address).
  const deployHash = await admin.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [admin.account.address],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
  });
  const address = deployReceipt.contractAddress!;
  console.log(`\nDeployed at ${address}`);
  console.log(`  tx=${deployHash} block=${deployReceipt.blockNumber} gasUsed=${deployReceipt.gasUsed}`);

  const registry = { address, abi: artifact.abi } as const;

  // 2) Grant operational roles (admin holds DEFAULT_ADMIN_ROLE).
  const grantOpHash = await admin.writeContract({
    ...registry,
    functionName: "grantRole",
    args: [OPERATOR_ROLE, operator.account.address],
  });
  const grantOpReceipt = await publicClient.waitForTransactionReceipt({ hash: grantOpHash });

  const grantSetHash = await admin.writeContract({
    ...registry,
    functionName: "grantRole",
    args: [SETTLEMENT_ROLE, settlement.account.address],
  });
  const grantSetReceipt = await publicClient.waitForTransactionReceipt({ hash: grantSetHash });

  console.log(`Granted OPERATOR_ROLE   -> ${operator.account.address} (block ${grantOpReceipt.blockNumber})`);
  console.log(`Granted SETTLEMENT_ROLE -> ${settlement.account.address} (block ${grantSetReceipt.blockNumber})`);

  // 3) Persist descriptor for the dApp and the standalone scripts.
  const descriptor = {
    network: "localhost",
    chainId: 31337,
    address,
    deployTxHash: deployHash,
    blockNumber: deployReceipt.blockNumber.toString(),
    gasUsed: deployReceipt.gasUsed.toString(),
    roles: {
      admin: admin.account.address,
      operator: operator.account.address,
      settlement: settlement.account.address,
    },
    roleGrantTx: { operator: grantOpHash, settlement: grantSetHash },
    abi: artifact.abi,
    deployedAt: new Date().toISOString(),
  };

  mkdirSync(resolve(process.cwd(), "deployments"), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), "deployments/localhost.json"),
    JSON.stringify(descriptor, null, 2),
  );
  // The web client fetches this statically from /deployment.json at runtime.
  mkdirSync(resolve(process.cwd(), "web/public"), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), "web/public/deployment.json"),
    JSON.stringify(
      { chainId: 31337, address, abi: artifact.abi, roles: descriptor.roles },
      null,
      2,
    ),
  );

  console.log("\nWrote deployments/localhost.json and web/public/deployment.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
