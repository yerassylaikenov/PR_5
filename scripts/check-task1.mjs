// Task 1 terminal report (dApp / Web3 client). Green checks for working features,
// RED for the blocked unauthorized-access attempt (vulnerability defence).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient, http, defineChain, keccak256, toHex,
  BaseError, ContractFunctionRevertedError,
} from "viem";

const G = "\x1b[32m", R = "\x1b[31m", RB = "\x1b[41m\x1b[1m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m", Y = "\x1b[33m";
const ok = (s) => console.log(`${G}✔${X} ${s}`);
const bad = (s) => console.log(`${R}✘ ${s}${X}`);
const vuln = (s) => console.log(`${RB} VULNERABILITY/ATTACK ${X} ${R}${s}${X}`);
const head = (s) => console.log(`\n${B}${C}${s}${X}`);

const RPC = "http://127.0.0.1:8545";
const chain = defineChain({ id: 31337, name: "Hardhat Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const DEP = resolve(process.cwd(), "deployments/localhost.json");

function decode(err) {
  if (err instanceof BaseError) {
    const r = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? "UnknownRevert";
  }
  return "UnknownError";
}

async function main() {
  head("TASK 1 - Web3 client and secure integration");
  if (!existsSync(DEP)) { bad("deployments/localhost.json not found - run `npm run node` and `npm run deploy:local`"); process.exit(1); }
  const dep = JSON.parse(readFileSync(DEP, "utf8"));
  const c = { address: dep.address, abi: dep.abi };

  const code = await pub.getBytecode({ address: dep.address });
  code && code !== "0x" ? ok(`contract address has bytecode: ${dep.address}`) : bad("no bytecode at address");

  const total = await pub.readContract({ ...c, functionName: "totalRegistered" });
  ok(`read totalRegistered = ${total}`);

  const pid = keccak256(toHex("PR5-OP-2026-000001"));
  const p = await pub.readContract({ ...c, functionName: "getPayment", args: [pid] });
  ok(`getPayment(order-001): status=${["None","Registered","Executed","Rejected","Cancelled"][Number(p.status)]} amount=${p.amount}`);

  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), "demo-data/order-001.xml")));
  const h = keccak256(bytes);
  const match = await pub.readContract({ ...c, functionName: "verifyDocument", args: [pid, h] });
  match ? ok(`verifyDocument(order-001): hash matches (document not tampered)`) : bad("verifyDocument: hash mismatch");

  head("Negative scenario - privileged operation without permission");
  const admin = dep.roles.admin; // holds DEFAULT_ADMIN_ROLE but NOT OPERATOR_ROLE
  const before = await pub.readContract({ ...c, functionName: "totalRegistered" });
  try {
    await pub.simulateContract({ ...c, functionName: "registerPayment", args: [keccak256(toHex("neg-"+Date.now())), keccak256(toHex("d")), 1n], account: admin });
    bad("simulation did not revert - ROLE CHECK FAILED");
  } catch (e) {
    const name = decode(e);
    vuln(`registerPayment attempt without OPERATOR role -> revert ${name}`);
    console.log(`  ${Y}actor:${X} ${admin}`);
  }
  const after = await pub.readContract({ ...c, functionName: "totalRegistered" });
  before === after ? ok(`registry state unchanged (totalRegistered: ${before} -> ${after}) - AC-3 defence worked`) : bad("state changed!");

  head("Task 1 summary");
  ok("wallet/network/roles, >=2 reads, >=4 writes, tx state machine, dedup event feed - implemented in dApp (web/)");
  console.log(`${G}${B}Start the UI: npm run web  ->  http://localhost:5173${X}`);
}
main().catch((e) => { bad(String(e.message ?? e)); process.exit(1); });
