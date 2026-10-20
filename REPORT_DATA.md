# REPORT_DATA — факты из реальных запусков

Сгенерировано: 2026-10-20T15:43:37.789Z

## 1. Инструменты и версии

| Компонент | Версия |
|---|---|
| ОС | Windows_NT 10.0.26300 (x64) |
| Node.js | v24.13.0 |
| npm | 11.6.2 |
| Hardhat | 3.18.1 |
| viem | 2.57.3 |
| TypeScript | 6.0.3 |
| OpenZeppelin Contracts | 5.6.1 |
| solc | 0.8.28 |
| React | 18.3.1 |
| Vite | 5.4.11 |
| Slither | не установлен (требует запуска у пользователя) |

## 2. Развёртывание

| Параметр | Значение |
|---|---|
| Адрес контракта | `0x5fbdb2315678afecb367f032d93f642f64180aa3` |
| Tx деплоя | `0x001a4cc0606582bd443ba42efe34cdfc5ac1f496dc82e5defaefa10b33c49a7b` |
| Блок | 1 |
| gasUsed деплоя | 963412 |
| Админ | `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266` |
| Оператор | `0x70997970c51812dc3a010c7d01b50e0d17dc79c8` |
| Расчётный центр | `0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc` |

## 3. Демонстрационные транзакции

| # | Функция | Актор | txHash | Блок | Статус | gasUsed |
|---|---|---|---|---|---|---|
| 1 | registerPayment | 0x70997970… | `0x0b9bcd393272…` | 4 | success | 118389 |
| 2 | registerPayment | 0x70997970… | `0x1f317914728a…` | 5 | success | 101289 |
| 3 | registerPayment | 0x70997970… | `0x31b90cd0fad7…` | 6 | success | 101277 |
| 4 | markExecuted | 0x3c44cddd… | `0x82e601b7f4e1…` | 7 | success | 61730 |
| 5 | markRejected | 0x3c44cddd… | `0x960c946913f7…` | 8 | success | 61993 |
| 6 | registerPayment | 0x70997970… | `0x826a0e639a8a…` | 9 | success | 101253 |
| 7 | markExecuted | 0x3c44cddd… | `0x5bd0fef770b2…` | 10 | success | 61706 |
| 8 | registerPayment | 0x70997970… | `0x66909af2220b…` | 11 | success | 101253 |
| 9 | registerPayment | 0x70997970… | `0xd2d287b5f894…` | 12 | success | 101265 |
| 10 | registerPayment | 0x70997970… | `0xc00e611e74dd…` | 13 | success | 101265 |
| 11 | registerPayment | 0x70997970… | `0x586714941317…` | 14 | success | 101253 |
| 12 | registerPayment | 0x70997970… | `0x4955c3d2717c…` | 15 | success | 101265 |

## 4. Тесты

| Категория | Команда | passed | failed |
|---|---|---|---|
| integration | npm run test:integration | 10 | 0 |
| invariants | npm run test:invariants | 1 | 0 |
| property | npm run test:property | 2 | 0 |

## 5. Статический анализ и зависимости

- Slither: не установлен (требует запуска у пользователя). Отчёт/инструкция — `reports/slither/`.
- npm audit (корень): high 0, critical 0, moderate 0, low 0.
- npm audit (web): high 1, critical 0, moderate 1, low 0 — dev-зависимости Vite/esbuild, в продакшен-бандл не попадают. Детали — `reports/deps/SUMMARY.md`.

## 6. Сработавшие алерты

| Правило | Критичность | Время | Актор | count | подавлено ранее |
|---|---|---|---|---|---|
| R-1 | High | 2026-10-20T15:43:23.195Z | 0x90f79bf6… | 3 | 0 |

## 7. Нагрузочный тест

| Метрика | A (послед.) | B (5×6 парал.) |
|---|---|---|
| Успешно/всего | 30/30 | 30/30 |
| p50, мс | 12.1 | 30.5 |
| p95, мс | 13.9 | 46.2 |
| Пропускная способность, оп/с | 79.3 | 151.5 |
| Доля неуспешных | 0.0% | 0.0% |
| gasUsed median | 101265 | 101265 |

Графики: `reports/load/chart-latency.svg`, `chart-distribution.svg`, `chart-gas.svg`. Анализ: `reports/load/SUMMARY.md`.
