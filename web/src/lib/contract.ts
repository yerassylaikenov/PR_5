// Contract/config access for the dApp. Address + ABI come from the deployment
// descriptor written by scripts/deploy.ts (served at /deployment.json). chainId
// and RPC are fixed by config (requirement 4.3).
import {
  createPublicClient, http, defineChain, keccak256, toHex,
  type Abi, type Hex,
} from "viem";

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8545";
export const MONITOR_URL =
  import.meta.env.VITE_MONITOR_URL ?? "http://127.0.0.1:8787/log";

export const localChain = defineChain({
  id: CHAIN_ID,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export const OPERATOR_ROLE = keccak256(toHex("OPERATOR_ROLE"));
export const SETTLEMENT_ROLE = keccak256(toHex("SETTLEMENT_ROLE"));
export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export interface Deployment {
  chainId: number;
  address: Hex;
  abi: Abi;
  roles: { admin: Hex; operator: Hex; settlement: Hex };
}

export async function loadDeployment(): Promise<Deployment> {
  const res = await fetch("/deployment.json", { cache: "no-store" });
  if (!res.ok) throw new Error("deployment.json not found — run `npm run deploy:local`");
  const envAddr = import.meta.env.VITE_CONTRACT_ADDRESS as Hex | undefined;
  const dep = (await res.json()) as Deployment;
  if (envAddr) dep.address = envAddr;
  return dep;
}

export const publicClient = createPublicClient({
  chain: localChain,
  transport: http(RPC_URL),
});

export const STATUS_LABELS = ["None", "Registered", "Executed", "Rejected", "Cancelled"];
