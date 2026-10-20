// Shared account / chain helpers for the standalone (tsx) scripts:
// monitor, loadtest, demo-attack, demo-normal.
//
// SECURITY: no raw private keys are stored in this repository. All local
// accounts are DERIVED at runtime from the PUBLIC Hardhat test mnemonic
// "test test test test test test test test test test test junk".
// These keys are world-known and MUST NEVER be used on a real network.
import { defineChain } from "viem";
import { mnemonicToAccount } from "viem/accounts";

export const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
export const CHAIN_ID = 31337;

// Fixed role layout used across all PR5 scripts and the dApp demo.
export const ROLE_INDEX = {
  admin: 0, // DEFAULT_ADMIN_ROLE (deployer)
  operator: 1, // OPERATOR_ROLE
  settlement: 2, // SETTLEMENT_ROLE
  outsider: 3, // no role (used for the negative / attack scenarios)
} as const;

export type RoleName = keyof typeof ROLE_INDEX;

/** Derive a local test account from the public mnemonic by address index. */
export function testAccount(index: number) {
  return mnemonicToAccount(TEST_MNEMONIC, { addressIndex: index });
}

export function roleAccount(role: RoleName) {
  return testAccount(ROLE_INDEX[role]);
}

/** Local Hardhat chain (chainId 31337) for viem clients. */
export const localChain = defineChain({
  id: CHAIN_ID,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
