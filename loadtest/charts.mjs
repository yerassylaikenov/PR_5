// Generates lightweight SVG charts (no heavy deps) and the analytical SUMMARY.md
// from reports/load/metrics.json + raw-A.json/raw-B.json.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "reports/load");
const metrics = JSON.parse(readFileSync(resolve(OUT, "metrics.json"), "utf8"));
const rawA = JSON.parse(readFileSync(resolve(OUT, "raw-A.json"), "utf8"));
const rawB = JSON.parse(readFileSync(resolve(OUT, "raw-B.json"), "utf8"));
const A = metrics.profiles.A;
const B = metrics.profiles.B;

const COL = { A: "#2563eb", B: "#ea580c", grid: "#d1d5db", text: "#111827" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function svgWrap(w, h, body, title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Segoe UI, Arial, sans-serif">
<rect width="${w}" height="${h}" fill="#ffffff"/>
<text x="${w / 2}" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="${COL.text}">${esc(title)}</text>
${body}
</svg>`;
}

// ---- Chart 1: grouped bars p50/p95 ----
function latencyChart() {
  const w = 640, h = 360, padL = 60, padB = 50, padT = 50, padR = 20;
  const groups = [["p50", A.latency.p50, B.latency.p50], ["p95", A.latency.p95, B.latency.p95]];
  const maxV = Math.max(A.latency.p95, B.latency.p95) * 1.2;
  const plotH = h - padB - padT, plotW = w - padL - padR;
  const y = (v) => padT + plotH - (v / maxV) * plotH;
  let body = "";
  for (let i = 0; i <= 5; i++) {
    const v = (maxV / 5) * i, yy = y(v);
    body += `<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="${COL.grid}" stroke-width="1"/>`;
    body += `<text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${COL.text}">${v.toFixed(0)}</text>`;
  }
  body += `<text x="16" y="${padT + plotH / 2}" transform="rotate(-90 16 ${padT + plotH / 2})" text-anchor="middle" font-size="12" fill="${COL.text}">latency, ms</text>`;
  const gw = plotW / groups.length, bw = 46;
  groups.forEach((g, gi) => {
    const cx = padL + gw * gi + gw / 2;
    [["A", g[1], COL.A, -bw - 4], ["B", g[2], COL.B, 4]].forEach(([lab, v, c, dx]) => {
      const yy = y(v), bh = padT + plotH - yy;
      body += `<rect x="${cx + dx}" y="${yy}" width="${bw}" height="${bh}" fill="${c}"/>`;
      body += `<text x="${cx + dx + bw / 2}" y="${yy - 6}" text-anchor="middle" font-size="11" fill="${COL.text}">${v.toFixed(1)}</text>`;
    });
    body += `<text x="${cx}" y="${h - padB + 20}" text-anchor="middle" font-size="13" fill="${COL.text}">${g[0]}</text>`;
  });
  body += legend(w - 200, 40);
  return svgWrap(w, h, body, "Latency p50 / p95: profile A vs B");
}

function legend(x, y) {
  return `<rect x="${x}" y="${y}" width="12" height="12" fill="${COL.A}"/><text x="${x + 18}" y="${y + 11}" font-size="12" fill="${COL.text}">A (seq.)</text>
<rect x="${x + 100}" y="${y}" width="12" height="12" fill="${COL.B}"/><text x="${x + 118}" y="${y + 11}" font-size="12" fill="${COL.text}">B (par.)</text>`;
}

// ---- Chart 2: latency scatter by tx index ----
function distributionChart() {
  const w = 640, h = 360, padL = 60, padB = 50, padT = 50, padR = 20;
  const all = [...rawA.results, ...rawB.results].filter((r) => r.status === "success");
  const maxLat = Math.max(...all.map((r) => r.latencyMs)) * 1.15;
  const maxIdx = 30;
  const plotH = h - padB - padT, plotW = w - padL - padR;
  const x = (i) => padL + (i / maxIdx) * plotW;
  const y = (v) => padT + plotH - (v / maxLat) * plotH;
  let body = "";
  for (let i = 0; i <= 5; i++) {
    const v = (maxLat / 5) * i, yy = y(v);
    body += `<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="${COL.grid}"/>`;
    body += `<text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="${COL.text}">${v.toFixed(0)}</text>`;
  }
  const dot = (arr, c) => arr.filter((r) => r.status === "success").map((r) => `<circle cx="${x(r.index)}" cy="${y(r.latencyMs)}" r="3.2" fill="${c}" fill-opacity="0.8"/>`).join("");
  body += dot(rawA.results, COL.A) + dot(rawB.results, COL.B);
  body += `<text x="${w / 2}" y="${h - 14}" text-anchor="middle" font-size="12" fill="${COL.text}">transaction number in profile</text>`;
  body += `<text x="16" y="${padT + plotH / 2}" transform="rotate(-90 16 ${padT + plotH / 2})" text-anchor="middle" font-size="12" fill="${COL.text}">latency, ms</text>`;
  body += legend(w - 200, 40);
  return svgWrap(w, h, body, "Latency distribution by transaction");
}

// ---- Chart 3: gasUsed min/median/max ----
function gasChart() {
  const w = 640, h = 360, padL = 70, padB = 50, padT = 50, padR = 20;
  const groups = [["min", A.gasUsed.min, B.gasUsed.min], ["median", A.gasUsed.median, B.gasUsed.median], ["max", A.gasUsed.max, B.gasUsed.max]];
  const maxV = Math.max(A.gasUsed.max, B.gasUsed.max) * 1.2;
  const plotH = h - padB - padT, plotW = w - padL - padR;
  const y = (v) => padT + plotH - (v / maxV) * plotH;
  let body = "";
  for (let i = 0; i <= 5; i++) {
    const v = (maxV / 5) * i, yy = y(v);
    body += `<line x1="${padL}" y1="${yy}" x2="${w - padR}" y2="${yy}" stroke="${COL.grid}"/>`;
    body += `<text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="10" fill="${COL.text}">${(v / 1000).toFixed(0)}k</text>`;
  }
  const gw = plotW / groups.length, bw = 44;
  groups.forEach((g, gi) => {
    const cx = padL + gw * gi + gw / 2;
    [["A", g[1], COL.A, -bw - 4], ["B", g[2], COL.B, 4]].forEach(([lab, v, c, dx]) => {
      const yy = y(v), bh = padT + plotH - yy;
      body += `<rect x="${cx + dx}" y="${yy}" width="${bw}" height="${bh}" fill="${c}"/>`;
      body += `<text x="${cx + dx + bw / 2}" y="${yy - 6}" text-anchor="middle" font-size="10" fill="${COL.text}">${Math.round(v)}</text>`;
    });
    body += `<text x="${cx}" y="${h - padB + 20}" text-anchor="middle" font-size="13" fill="${COL.text}">${g[0]}</text>`;
  });
  body += legend(w - 200, 40);
  return svgWrap(w, h, body, "gasUsed per registerPayment (min / median / max)");
}

writeFileSync(resolve(OUT, "chart-latency.svg"), latencyChart());
writeFileSync(resolve(OUT, "chart-distribution.svg"), distributionChart());
writeFileSync(resolve(OUT, "chart-gas.svg"), gasChart());

// ---- SUMMARY.md ----
const pct = (x) => (x * 100).toFixed(1) + "%";
const summary = `# Нагрузочный эксперимент — профили A vs B

Сгенерировано: ${metrics.generatedAt}

## Методика измерений

- Клиент — viem + локальные аккаунты Hardhat (мнемоника \`test...junk\`), **без MetaMask**.
- Операция — \`registerPayment\` с уникальным \`paymentId\` на каждую транзакцию.
- **Латентность** каждой транзакции = от момента отправки (\`writeContract\`) до получения квитанции (\`waitForTransactionReceipt\`), мс.
- **p50 / p95** — метод ближайшего ранга: \`rank = ceil(p/100 * N)\`, индексация с 1 по возрастанию отсортированной выборке.
- **Пропускная способность** = успешные операции / полное время профиля (оп/с).
- **Доля неуспешных** = \`receipt.status = reverted\` или ошибка отправки.
- **Nonce**: один раз \`getTransactionCount(pending)\` на аккаунт, далее локальный инкремент и явная передача \`nonce\`.
- Одинаковый \`gasPrice = ${metrics.gasPrice}\` для всех транзакций; **3 транзакции прогрева** на профиль не учитываются; стартовый блок фиксируется (A: ${rawA.startBlock}, B: ${rawB.startBlock}).
- **Режим майнинга локальной сети — automine (по умолчанию): 1 транзакция в блок.** Это определяет форму результата.

## Результаты

| Метрика | Профиль A (30 послед., 1 аккаунт) | Профиль B (5×6 параллельно) |
|---|---|---|
| Успешно / всего | ${A.successful} / ${A.totalTx} | ${B.successful} / ${B.totalTx} |
| Доля неуспешных | ${pct(A.failureRate)} | ${pct(B.failureRate)} |
| Полное время, мс | ${A.wallTimeMs.toFixed(0)} | ${B.wallTimeMs.toFixed(0)} |
| Пропускная способность, оп/с | ${A.throughputOpsSec.toFixed(1)} | ${B.throughputOpsSec.toFixed(1)} |
| Задержка p50, мс | ${A.latency.p50.toFixed(1)} | ${B.latency.p50.toFixed(1)} |
| Задержка p95, мс | ${A.latency.p95.toFixed(1)} | ${B.latency.p95.toFixed(1)} |
| Задержка min / max, мс | ${A.latency.min.toFixed(1)} / ${A.latency.max.toFixed(1)} | ${B.latency.min.toFixed(1)} / ${B.latency.max.toFixed(1)} |
| gasUsed min / median / max | ${A.gasUsed.min} / ${A.gasUsed.median} / ${A.gasUsed.max} | ${B.gasUsed.min} / ${B.gasUsed.median} / ${B.gasUsed.max} |
| gasUsed сумма | ${A.gasUsed.sum} | ${B.gasUsed.sum} |

Графики: \`chart-latency.svg\`, \`chart-distribution.svg\`, \`chart-gas.svg\`.

## Анализ

**Ограничивающий компонент — не смарт-контракт.** gasUsed на \`registerPayment\` практически постоянен (${A.gasUsed.median} ед.), а задержки определяются **производством блоков и последовательной обработкой nonce на уровне JSON-RPC/EVM**, а не логикой контракта. В режиме automine каждая транзакция упаковывается в отдельный блок, поэтому:

- В профиле **A** транзакции строго последовательны (каждая ждёт квитанцию предыдущей) — пропускная способность ограничена темпом «одна транзакция → один блок».
- В профиле **B** пять аккаунтов отправляют параллельно, независимые nonce-последовательности позволяют узлу чередовать блоки разных отправителей, поэтому **суммарная пропускная способность выше** (${B.throughputOpsSec.toFixed(1)} против ${A.throughputOpsSec.toFixed(1)} оп/с), но **p95 растёт** (${B.latency.p95.toFixed(1)} против ${A.latency.p95.toFixed(1)} мс) из-за конкуренции за производство блоков и роста очереди.

**Мера оптимизации.** Включить **интервальный майнинг с несколькими транзакциями в блоке** (\`evm_setIntervalMining\` / \`evm_setAutomine(false)\`) или **батчинг** нескольких регистраций в один блок. Ожидаемый эффект: пропускная способность растёт, так как устраняется ограничение «1 транзакция = 1 блок»; p95 для профиля B снижается, поскольку транзакции перестают конкурировать за отдельные блоки и подтверждаются «пачкой». Для продакшена аналог — отправка пакета поручений одной транзакцией/мультиколлом, что снижает накладные расходы на подпись и подтверждение.
`;
writeFileSync(resolve(OUT, "SUMMARY.md"), summary);
console.log("[charts] wrote chart-latency.svg, chart-distribution.svg, chart-gas.svg, SUMMARY.md");
