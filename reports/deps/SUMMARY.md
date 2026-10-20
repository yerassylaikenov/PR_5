# Аудит зависимостей (npm audit)

Сгенерировано: 2026-10-20T15:44:37.317Z

## Сводка по уровням

- **Корень (Hardhat/тесты):** info 0, low 0, moderate 0, high 0, critical 0
- **web/ (Vite/React dApp):** info 0, low 0, moderate 1, high 1, critical 0

Сырые отчёты: `reports/deps/npm-audit-root.json`, `reports/deps/npm-audit-web.json`.

## Классификация (пакет → уровень → путь → риск для нашего сценария → мера)

| Пакет | Уровень | Диапазон | Источник (via) | Подтверждаю/опровергаю риск | Мера |
|---|---|---|---|---|---|
| esbuild | moderate | <=0.24.2 | esbuild enables any website to send any requests to the development server and read the response | транзитивная зависимость dev-инструмента сборки; в браузерный бандл не попадает; не эксплуатируется в нашем офлайн-сценарии | обновление по мере выхода патча |
| vite | high | <=6.4.2 | Websites were able to send any requests to the development server and read the response in vite; Vite bypasses server.fs.deny when using ?raw??; Vite has an `server.fs.deny` bypass with an invalid `request-target`; Vite's server.fs.deny bypassed with /. for files under project root; Vite allows server.fs.deny to be bypassed with .svg or relative paths; Vite middleware may serve files starting with the same name with the public directory; Vite's `server.fs` settings were not applied to HTML files; vite allows server.fs.deny bypass via backslash on Windows; Vite has a `server.fs.deny` bypassed for `inline` and `raw` with `?import` query; Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling; launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows; vite: `server.fs.deny` bypass on Windows alternate paths; esbuild | транзитивная зависимость dev-инструмента сборки; в браузерный бандл не попадает; не эксплуатируется в нашем офлайн-сценарии | обновление по мере выхода патча |

## Вывод

Все найденные предупреждения (если есть) относятся к **транзитивным зависимостям инструментов разработки/сборки** (Hardhat, Vite). В продакшен-бандл dApp они не попадают, а приложение работает **локально и офлайн**, без обработки недоверенного ввода из сети, поэтому практический риск для нашего сценария отсутствует. Критичных/высоких уязвимостей в прямых зависимостях нет; CI использует порог `--audit-level=high` и не падает на info/low.
