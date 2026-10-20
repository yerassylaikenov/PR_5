// Assembles REPORT_DATA.md and report-data.json from REAL run artifacts and the
// live chain. Must be run with the local node up and the contract deployed.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";
import { createPublicClient, http, defineChain } from "viem";

const ROOT = process.cwd();
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const chain = defineChain({ id: 31337, name: "Hardhat Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });

const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : null);
const readJson = (p) => { const t = read(p); return t ? JSON.parse(t) : null; };
const pkg = readJson("package.json");
const webPkg = readJson("web/package.json");

function npmVersion() {
  const r = spawnSync("npm", ["-v"], { shell: true, encoding: "utf8" });
  return (r.stdout || "").trim();
}

const STATUS = ["None", "Registered", "Executed", "Rejected", "Cancelled"];
const FN_BY_TO = { 2: "markExecuted", 3: "markRejected", 4: "cancelPayment" };

async function demoTransactions(dep) {
  if (!dep) return [];
  const rows = [];
  const reg = await pub.getContractEvents({ address: dep.address, abi: dep.abi, eventName: "PaymentRegistered", fromBlock: 0n, toBlock: "latest" });
  const st = await pub.getContractEvents({ address: dep.address, abi: dep.abi, eventName: "PaymentStatusChanged", fromBlock: 0n, toBlock: "latest" });
  const all = [...reg, ...st].sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);
  for (const e of all.slice(0, 12)) {
    const rc = await pub.getTransactionReceipt({ hash: e.transactionHash });
    const fn = e.eventName === "PaymentRegistered" ? "registerPayment" : (FN_BY_TO[Number(e.args.to)] ?? "statusChange");
    rows.push({
      fn, actor: (e.args.operator ?? e.args.actor ?? rc.from).toLowerCase(),
      txHash: e.transactionHash, block: rc.blockNumber.toString(),
      status: rc.status, gasUsed: rc.gasUsed.toString(),
    });
  }
  return rows;
}

function auditCounts(label) {
  const j = readJson(`reports/deps/npm-audit-${label}.json`);
  return j?.metadata?.vulnerabilities ?? null;
}

async function main() {
  const dep = readJson("deployments/localhost.json");
  const tests = readJson("reports/tests/summary.json");
  const load = readJson("reports/load/metrics.json");
  const alerts = (read("reports/monitoring/alerts.log") || "").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const slitherPending = existsSync(resolve(ROOT, "reports/slither/STATUS.md")) && !existsSync(resolve(ROOT, "reports/slither/slither.json"));
  let demoTx = [];
  try { demoTx = await demoTransactions(dep); } catch { /* node may be down */ }

  const data = {
    generatedAt: new Date().toISOString(),
    tools: {
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      node: process.version,
      npm: npmVersion(),
      hardhat: pkg?.devDependencies?.hardhat,
      viem: pkg?.devDependencies?.viem,
      typescript: pkg?.devDependencies?.typescript,
      openzeppelin: pkg?.devDependencies?.["@openzeppelin/contracts"],
      solc: "0.8.28",
      react: webPkg?.dependencies?.react,
      vite: webPkg?.devDependencies?.vite,
      slither: slitherPending ? "не установлен (требует запуска у пользователя)" : "установлен",
    },
    deployment: dep ? {
      address: dep.address, deployTxHash: dep.deployTxHash, blockNumber: dep.blockNumber,
      gasUsed: dep.gasUsed, roles: dep.roles,
    } : null,
    demoTx, tests, load, alerts,
    audit: { root: auditCounts("root"), web: auditCounts("web") },
    slitherPending,
  };
  writeFileSync(resolve(ROOT, "reports/report-data.json"), JSON.stringify(data, null, 2));

  // ----- REPORT_DATA.md -----
  const t = data.tools;
  const md = [];
  md.push("# REPORT_DATA — факты из реальных запусков\n");
  md.push(`Сгенерировано: ${data.generatedAt}\n`);
  md.push("## 1. Инструменты и версии\n");
  md.push("| Компонент | Версия |\n|---|---|");
  md.push(`| ОС | ${t.os} |`);
  md.push(`| Node.js | ${t.node} |`);
  md.push(`| npm | ${t.npm} |`);
  md.push(`| Hardhat | ${t.hardhat} |`);
  md.push(`| viem | ${t.viem} |`);
  md.push(`| TypeScript | ${t.typescript} |`);
  md.push(`| OpenZeppelin Contracts | ${t.openzeppelin} |`);
  md.push(`| solc | ${t.solc} |`);
  md.push(`| React | ${t.react} |`);
  md.push(`| Vite | ${t.vite} |`);
  md.push(`| Slither | ${t.slither} |\n`);

  if (data.deployment) {
    md.push("## 2. Развёртывание\n");
    md.push("| Параметр | Значение |\n|---|---|");
    md.push(`| Адрес контракта | \`${data.deployment.address}\` |`);
    md.push(`| Tx деплоя | \`${data.deployment.deployTxHash}\` |`);
    md.push(`| Блок | ${data.deployment.blockNumber} |`);
    md.push(`| gasUsed деплоя | ${data.deployment.gasUsed} |`);
    md.push(`| Админ | \`${data.deployment.roles.admin}\` |`);
    md.push(`| Оператор | \`${data.deployment.roles.operator}\` |`);
    md.push(`| Расчётный центр | \`${data.deployment.roles.settlement}\` |\n`);
  }

  if (demoTx.length) {
    md.push("## 3. Демонстрационные транзакции\n");
    md.push("| # | Функция | Актор | txHash | Блок | Статус | gasUsed |\n|---|---|---|---|---|---|---|");
    demoTx.forEach((r, i) => md.push(`| ${i + 1} | ${r.fn} | ${r.actor.slice(0, 10)}… | \`${r.txHash.slice(0, 14)}…\` | ${r.block} | ${r.status} | ${r.gasUsed} |`));
    md.push("");
  }

  if (tests) {
    md.push("## 4. Тесты\n");
    md.push("| Категория | Команда | passed | failed |\n|---|---|---|---|");
    for (const r of tests.results) md.push(`| ${r.category} | npm run test:${r.category} | ${r.passing} | ${r.failing} |`);
    md.push("");
  }

  md.push("## 5. Статический анализ и зависимости\n");
  md.push(`- Slither: ${t.slither}. Отчёт/инструкция — \`reports/slither/\`.`);
  const ar = data.audit.root, aw = data.audit.web;
  if (ar) md.push(`- npm audit (корень): high ${ar.high ?? 0}, critical ${ar.critical ?? 0}, moderate ${ar.moderate ?? 0}, low ${ar.low ?? 0}.`);
  if (aw) md.push(`- npm audit (web): high ${aw.high ?? 0}, critical ${aw.critical ?? 0}, moderate ${aw.moderate ?? 0}, low ${aw.low ?? 0} — dev-зависимости Vite/esbuild, в продакшен-бандл не попадают. Детали — \`reports/deps/SUMMARY.md\`.\n`);

  if (alerts.length) {
    md.push("## 6. Сработавшие алерты\n");
    md.push("| Правило | Критичность | Время | Актор | count | подавлено ранее |\n|---|---|---|---|---|---|");
    for (const a of alerts) md.push(`| ${a.rule} | ${a.severity} | ${a.ts} | ${a.actor.slice(0, 10)}… | ${a.count} | ${a.suppressedSincePrevious ?? 0} |`);
    md.push("");
  }

  if (load) {
    const A = load.profiles.A, B = load.profiles.B;
    md.push("## 7. Нагрузочный тест\n");
    md.push("| Метрика | A (послед.) | B (5×6 парал.) |\n|---|---|---|");
    md.push(`| Успешно/всего | ${A.successful}/${A.totalTx} | ${B.successful}/${B.totalTx} |`);
    md.push(`| p50, мс | ${A.latency.p50.toFixed(1)} | ${B.latency.p50.toFixed(1)} |`);
    md.push(`| p95, мс | ${A.latency.p95.toFixed(1)} | ${B.latency.p95.toFixed(1)} |`);
    md.push(`| Пропускная способность, оп/с | ${A.throughputOpsSec.toFixed(1)} | ${B.throughputOpsSec.toFixed(1)} |`);
    md.push(`| Доля неуспешных | ${(A.failureRate * 100).toFixed(1)}% | ${(B.failureRate * 100).toFixed(1)}% |`);
    md.push(`| gasUsed median | ${A.gasUsed.median} | ${B.gasUsed.median} |`);
    md.push("\nГрафики: `reports/load/chart-latency.svg`, `chart-distribution.svg`, `chart-gas.svg`. Анализ: `reports/load/SUMMARY.md`.\n");
  }

  writeFileSync(resolve(ROOT, "REPORT_DATA.md"), md.join("\n"));
  console.log("[report] wrote REPORT_DATA.md and reports/report-data.json");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
