import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

// PR5 runs fully local and offline: only the in-process EDR network (for tests)
// and the local JSON-RPC node on 127.0.0.1:8545 (chainId 31337) are used.
// There are NO secrets, private keys or external RPC URLs in this repository.
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  paths: {
    tests: {
      // All Node.js (node:test + viem) suites live under ./test.
      nodejs: "./test",
    },
  },
  networks: {
    // In-process simulated L1 used by `hardhat test` (integration/invariants/property).
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // External local node started by `npm run node` (used by the dApp and scripts).
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
  },
});
