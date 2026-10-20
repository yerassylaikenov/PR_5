// Reads the local deployment descriptor produced by scripts/deploy.ts.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Abi, Hex } from "viem";

export interface Deployment {
  network: string;
  chainId: number;
  address: Hex;
  deployTxHash: Hex;
  blockNumber: string;
  gasUsed: string;
  roles: {
    admin: Hex;
    operator: Hex;
    settlement: Hex;
  };
  roleGrantTx: { operator: Hex; settlement: Hex };
  abi: Abi;
  deployedAt: string;
}

const DEPLOYMENT_PATH = resolve(process.cwd(), "deployments", "localhost.json");

export function loadDeployment(): Deployment {
  if (!existsSync(DEPLOYMENT_PATH)) {
    throw new Error(
      `Deployment not found at ${DEPLOYMENT_PATH}. Run \`npm run deploy:local\` first.`,
    );
  }
  return JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8")) as Deployment;
}
