# Доказательство корректной авторизации

Таблица «кто → какая функция → ожидаемый результат», подтверждённая тестами
(`test/integration`, `test/property`). Роли проверяются контрактом по
`msg.sender` (AC-3).

| Вызывающий | Функция | Ожидаемый результат | Подтверждающий тест |
|---|---|---|---|
| Оператор (OPERATOR_ROLE) | `registerPayment` | успех | integration т.1 |
| Оператор-инициатор | `cancelPayment` | успех | integration т.3 |
| Расчётный центр (SETTLEMENT_ROLE), ≠ инициатор | `markExecuted` | успех | integration т.1 |
| Расчётный центр, ≠ инициатор | `markRejected(reasonCode)` | успех, код сохранён | integration т.2 |
| Админ (DEFAULT_ADMIN_ROLE) | `pause` / `unpause` | успех | integration т.9 |
| Посторонний (без роли) | `registerPayment` | revert `AccessControlUnauthorizedAccount` | integration т.4; property P2 |
| Посторонний (без роли) | `cancelPayment`/`markExecuted`/`markRejected` | revert `AccessControlUnauthorizedAccount` | property P2 |
| Держатель обеих ролей, он же инициатор | `markExecuted` своего поручения | revert `SelfSettlementForbidden` | integration т.5 |
| Оператор, не инициатор | `cancelPayment` чужого поручения | revert `NotPaymentInitiator` | (контракт; охвачено логикой т.3/INV) |
| Любой | запись при паузе | revert `EnforcedPause` | integration т.9 |
| Не-админ | `pause` | revert `AccessControlUnauthorizedAccount` | integration «extra» |
| Любой | `registerPayment` с нулевыми полями | revert `InvalidPaymentId`/`InvalidDocHash`/`InvalidAmount` | integration т.7 |
| Любой | повтор `paymentId` / переход из финала | revert `PaymentAlreadyExists`/`InvalidStatusTransition` | integration т.6 |
