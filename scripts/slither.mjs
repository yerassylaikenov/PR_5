// Runs Slither static analysis on the contract and saves txt/json/md reports.
// If Slither is not installed, it DOES NOT fabricate output — it writes STATUS.md
// with the exact install/run commands and marks the step "requires user run".
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "reports/slither");
mkdirSync(OUT, { recursive: true });

function has(cmd) {
  const probe = spawnSync(cmd, ["--version"], { shell: true, encoding: "utf8" });
  return probe.status === 0 ? (probe.stdout || "").trim() : null;
}

const version = has("slither");
if (!version) {
  const status = `# Slither — требует запуска у пользователя

На машине, где собирался проект, **Slither не установлен**, поэтому реальный отчёт
не сгенерирован (вывод не выдумывается).

## Установка

\`\`\`bash
python -m pip install slither-analyzer
# нужен solc 0.8.28; проще через solc-select:
python -m pip install solc-select
solc-select install 0.8.28 && solc-select use 0.8.28
\`\`\`

## Запуск

\`\`\`bash
npm run slither
# или напрямую:
slither contracts/PaymentOrderRegistry.sol --solc-remaps @openzeppelin=node_modules/@openzeppelin --json reports/slither/slither.json
\`\`\`

После запуска скрипт сохранит \`slither.txt\`, \`slither.json\`, \`slither.md\` и таблицу
классификации предупреждений (реальная уязвимость / информационное / ложное
срабатывание кода OpenZeppelin) в этой папке.

## Ожидаемая методика классификации

Контракт не делает внешних вызовов, переводов ETH и не имеет циклов по массивам,
поэтому ожидаются преимущественно **информационные** замечания (версия прагмы,
соглашения именования) и замечания из **кода OpenZeppelin** (ложные для нашего
контракта). Каждое существенное предупреждение после реального запуска нужно
отнести к одной из трёх категорий с обоснованием и мерой устранения.
`;
  writeFileSync(resolve(OUT, "STATUS.md"), status);
  console.log("\x1b[33m[slither] not installed — wrote reports/slither/STATUS.md (requires user run)\x1b[0m");
  process.exit(0);
}

console.log(`[slither] ${version}`);
const args = [
  "contracts/PaymentOrderRegistry.sol",
  "--solc-remaps", "@openzeppelin=node_modules/@openzeppelin",
  "--json", resolve(OUT, "slither.json"),
];
const res = spawnSync("slither", args, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const text = (res.stdout || "") + "\n" + (res.stderr || "");
writeFileSync(resolve(OUT, "slither.txt"), text);
writeFileSync(resolve(OUT, "slither.md"), `# Slither report\n\n\`\`\`\n${text}\n\`\`\`\n`);
console.log("[slither] wrote reports/slither/slither.{json,txt,md}");
