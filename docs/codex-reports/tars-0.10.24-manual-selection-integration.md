# TARS 0.10.24 — интеграция ручного выбора типа изображения

Дата: 2026-09-02

Ветка: `integration/manual-selection-current-develop`

База develop: `e048ed796724d3cfb9c4f433430f65537ab8bec5`

Feature HEAD: `5fee02f2c96bef9cde1a1ed6d4ea7fa573dd34f6`

Release commit: `331a69e`

## Что изменено

- Feature-ветка интегрирована от текущего `origin/develop` только fast-forward; merge commit и разрешение конфликтов не потребовались.
- Для каждого нового изображения в personal room до обработки создаётся один компактный выбор: «Чек», «Фото работы», «Рассылка».
- До выбора не запускаются receipt, work-photo и mailing pipelines и не изменяется финансовый индекс.
- Выбор привязан к canonical message claim: original и preview используют одно состояние, один выбор и один pipeline.
- Receipt вызывает существующую полную проверку даты, суммы, статуса, identity и дублей.
- Work photo использует отдельные primary/dedicated financial-document safety checks без Yandex/receipt OCR; ошибки provider/parser закрывают маршрут безопасно.
- Mailing использует существующий mailing-proof accounting без запуска receipt или photo pipeline.
- Автоматические classifiers и `PERSONAL_IMAGE_PIPELINE_V2` сохранены как диагностические/safety-компоненты.
- Версия поднята с `0.10.23` до `0.10.24` только после первого полностью зелёного интеграционного прогона.
- Packaging CI trigger расширен только для integration-ветки.

## Затронутые файлы этапа интеграции

- `.github/workflows/scanner2-packaging-ci.yml`
- `app.json`
- `package.json`
- `package-lock.json`
- `tests/scanner2-packaging.test.js`
- `tests/scanner2-runtime-record-only.test.js`

Функциональные файлы и тесты ручного выбора пришли из проверенной feature-ветки без изменения истории.

## Результаты проверок

- Manual image selection runtime: PASS.
- Preview/original idempotency: PASS.
- Receipt path: PASS.
- Work-photo path and financial/document block: PASS.
- Mailing path: PASS.
- Rejected receipt → `cheki-kontrol`: PASS.
- Personal-room owner attribution: PASS.
- Running total: PASS.
- `PERSONAL_IMAGE_PIPELINE_V2` telemetry/privacy: PASS.
- Scanner/runtime: `22/22` PASS.
- Legacy: `77/77` PASS.
- Safe deploy workflow and token hygiene: PASS.
- Node syntax and `git diff --check`: PASS.
- Canonical build, ZIP integrity and bundle policy: PASS.
- ZIP contents: `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, `icon.png`.
- Production source SHA-256: `e60e4b2206c44e19b7c8e28e2e073900553ae6ccba27c01e20382117184ac1f5`.
- Bundled `TarsReportApp.js` SHA-256: `34742ac147485c4a5f59dc236e4048db27918987a6e4a86f83cb6637e9f9c0ca`.
- ZIP SHA-256 (diagnostic): `256b83ceae42bea9a0f1aef2b18ac0f171e4d0f3453e0aa3a7d6a39a77bfb0f7`.

## Сохранённые гарантии

- Receipt OCR/date/amount/identity/duplicate logic не упрощалась.
- Rejected → control, running total и текущая owner attribution сохранены.
- Scanner 2.0 остаётся `RECORD_ONLY`; runtime decision engine не подключён.
- `develop`, `main` и production settings не изменены.
- Deploy не выполнялся.

## Риски

Регрессионный риск: **MEDIUM**.

Главный риск связан с новым интерактивным состоянием и Rocket.Chat event races. Он ограничен persistence-состоянием выбора, canonical message key и существующим post-message claim. При ошибке safety provider/parser work-photo маршрут fail-closed и не принимает изображение автоматически.

## Следующий шаг

Проверить успешный Packaging CI integration-ветки. После отдельного разрешения можно выполнить fast-forward в `develop`, дождаться validation-only workflow и только отдельной командой готовить manual deploy.
