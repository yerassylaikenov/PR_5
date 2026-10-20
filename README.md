# PR5 — Web3-интеграция, безопасность, мониторинг и DevSecOps реестра платёжных поручений

Практическая работа №5, вариант №1 «Банки и финтех». Проект продолжает ПР3:
проверка статуса межбанковского платёжного поручения. Всё работает **локально и
офлайн** на сети Hardhat `chainId 31337`.

- **Задание 1** — Web3-клиент (dApp) с безопасной интеграцией MetaMask.
- **Задание 2** — верификация и анализ безопасности (STRIDE, инварианты, тесты, Slither, аудит).
- **Задание 3** — мониторинг, DevSecOps (CI) и нагрузочный эксперимент.

## Стек

| Слой | Технологии |
|---|---|
| Контракт | Solidity 0.8.28, OpenZeppelin 5.6.1 (`AccessControl`, `Pausable`, `SafeCast`) |
| Инфраструктура | Hardhat 3.18.1, `@nomicfoundation/hardhat-toolbox-viem`, viem 2.57.3, Node 24, TypeScript |
| dApp | Vite + React + TypeScript + viem v2, MetaMask через `window.ethereum` (EIP-1193), без wagmi |
| Мониторинг/нагрузка | Node + viem (standalone через `tsx`), SVG без тяжёлых зависимостей |

## Контракт из ПР3 (без изменений)

`contracts/PaymentOrderRegistry.sol` взят из ПР3 **побайтово**.

```
sha256(contracts/PaymentOrderRegistry.sol) = 13c4f8891ca3b601fbb02045f12d1cc226c6af3c54d5700fb336898ad270bfc2
```

Проверка: `sha256sum contracts/PaymentOrderRegistry.sol` (Windows: `CertUtil -hashfile contracts/PaymentOrderRegistry.sol SHA256`).

Автомат статусов: `None → Registered → {Executed | Rejected | Cancelled}`; финальные
статусы необратимы, `paymentId` не переиспользуется. Авторизация — строго по
`msg.sender` (`onlyRole`), `tx.origin` не используется.

## Установка

```bash
npm ci            # зависимости корня (Hardhat/тесты/мониторинг/нагрузка)
npm --prefix web ci   # зависимости dApp
npm run compile   # компиляция контракта (генерирует ABI в artifacts/)
```

Требуется Node ≥ 22.10 (проверено на Node 24). Для Slither — Python + `slither-analyzer`
(опционально, см. `reports/slither/STATUS.md`).

## Запуск (кратко; подробный сценарий — в `DEMO.md`)

```bash
# Терминал 1
npm run node            # локальный узел Hardhat, 127.0.0.1:8545, chainId 31337
# Терминал 2
npm run deploy:local    # деплой + выдача ролей -> deployments/localhost.json
npm run seed            # 2–3 демо-поручения
# Терминал 3
npm run monitor         # телеметрия + правила R-1/R-2, эндпоинт :8787
# Терминал 4
npm run web             # dApp на http://localhost:5173
```

## Все команды

| Команда | Назначение |
|---|---|
| `npm run compile` | компиляция контракта |
| `npm run node` | локальный узел Hardhat (8545) |
| `npm run deploy:local` | деплой + роли, запись `deployments/localhost.json` |
| `npm run seed` | демо-поручения для «живого» интерфейса |
| `npm run web` | dApp (Vite, порт 5173) |
| `npm test` | все тесты (интеграционные + инварианты + property), логи в `reports/tests/` |
| `npm run test:integration` / `:invariants` / `:property` | по категориям |
| `npm run monitor` | монитор (телеметрия + правила) |
| `npm run demo:alert` | демонстрация срабатывания R-1 → `reports/monitoring/alert-triggered.log` |
| `npm run demo:normal` | штатный сценарий без алертов → `reports/monitoring/no-alert.log` |
| `npm run loadtest` | нагрузочный тест A/B + SVG-графики → `reports/load/` |
| `npm run slither` | Slither (или инструкция, если не установлен) |
| `npm run audit` | `npm audit` корня и web → `reports/deps/` |
| `npm run ci:local` | весь CI-набор локально → `reports/ci/ci-local.log` |
| `npm run check:secrets` | проверка отсутствия секретов в репозитории |
| `npm run report:data` | сбор `REPORT_DATA.md` из реальных запусков |
| `npm run reset` | сброс локального состояния после перезапуска ноды |
| `npm run demo:all` | тесты + мониторинг-демо + нагрузка одной командой |

## Структура

```
contracts/      контракт ПР3 (без изменений)
scripts/        deploy, seed, демо-атака/штатный, slither, audit, ci, утилиты
test/           integration/ invariants/ property/  (node:test + viem)
web/            dApp (Vite + React + viem)
monitor/        collector.ts (телеметрия + HTTP :8787), rules.ts (R-1/R-2), alerts.ts (cooldown)
loadtest/       run.ts (A/B), metrics.ts (p50/p95), charts.mjs (SVG)
docs/           STRIDE.md, INVARIANTS.md, ANSWERS.md, AUTHZ_MATRIX.md, architecture/
demo-data/      синтетические XML-поручения
reports/        ВСЕ артефакты запусков (tests, slither, deps, monitoring, load, ci, screenshots)
deployments/    localhost.json (генерируется деплоем)
launchers/      окна-терминалы по заданиям (галочки/красные уязвимости)
```

## Важные инженерные решения

- **p50/p95** — метод ближайшего ранга: `rank = ceil(p/100 × N)` на возрастающей
  выборке (подробно в `reports/load/SUMMARY.md`).
- **Инварианты** реализованы на TypeScript + ghost-модель (единый стек, проще),
  обоснование — в `docs/INVARIANTS.md`.
- **Мониторинг неуспешных транзакций.** События откатившихся EVM-транзакций не
  попадают в журнал логов, поэтому правила R-1/R-2 строятся на **квитанциях
  транзакций и прикладных записях**, а не на `eth_getLogs` (см. комментарии в
  `monitor/rules.ts` и `monitor/collector.ts`).
- **Безопасность.** Приватных ключей в репозитории нет: локальные аккаунты
  выводятся из публичной тестовой мнемоники `test … junk` в рантайме; `.env` — в
  `.gitignore`; в телеметрию пишутся только хеши и идентификаторы.

## Схема архитектуры

`docs/architecture/PR5_Architecture.png` — зоны «Пользователь → dApp → Кошелёк →
RPC → Контракт», границы доверия и точки проверки полномочий AC-1 (UI), AC-2
(кошелёк), **AC-3 (контракт, `onlyRole` по `msg.sender` — единственная авторитетная)**.
