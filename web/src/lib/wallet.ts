// MetaMask (EIP-1193) access via window.ethereum. No wagmi. Private keys never
// leave the wallet; the dApp only requests accounts, chainId and signatures.
import { createWalletClient, custom, type Hex, type WalletClient } from "viem";
import { localChain, CHAIN_ID, RPC_URL } from "./contract";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
}

export function getProvider(): Eip1193Provider | null {
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

export async function connectWallet(): Promise<Hex[]> {
  const p = getProvider();
  if (!p) throw new Error("MetaMask не найден. Установите расширение MetaMask.");
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as Hex[];
  return accounts;
}

export async function getChainId(): Promise<number> {
  const p = getProvider();
  if (!p) return 0;
  const hex = (await p.request({ method: "eth_chainId" })) as string;
  return parseInt(hex, 16);
}

const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);

export async function switchNetwork(): Promise<void> {
  const p = getProvider();
  if (!p) throw new Error("MetaMask не найден");
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    // 4902 — chain not added to MetaMask yet; add it, then it becomes current.
    if ((err as { code?: number }).code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX,
            chainName: "Hardhat Local (PR5)",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [RPC_URL],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export function makeWalletClient(account: Hex): WalletClient {
  const p = getProvider();
  if (!p) throw new Error("MetaMask не найден");
  return createWalletClient({ account, chain: localChain, transport: custom(p) });
}
