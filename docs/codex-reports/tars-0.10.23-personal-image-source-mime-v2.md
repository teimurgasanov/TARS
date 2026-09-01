# TARS 0.10.23 — privacy-safe SOURCE/MIME telemetry

## Контрольная точка

- Base `origin/develop`: `8a59df449074d157b6e25b8289a07b7b41ade0b0`
- Release branch: `diagnostic/personal-image-source-mime-v2`
- Release commit: `eb84e8b0450848ada6d73c569ada9ab7a882a8ff`
- CI-trigger commit: `9097829c09e7b7c6e118d1179f154516cc771b2d`
- Version: `0.10.23`
- Deploy: не выполнялся

## Что изменено

- Добавлено whitelist-событие `PERSONAL_IMAGE_PIPELINE_V2` для personal image classification.
- Добавлены нормализованные SOURCE, MIME, cache, provider transport/parser, receipt и final поля.
- MIME определяется read-only по magic bytes для JPEG, PNG, WebP и ISO-BMFF brands HEIC/HEIF.
- Добавлены runtime-сценарии original/preview fallback, MIME match/mismatch, provider timeout, schema mismatch и cache hit/miss.
- Добавлен privacy gate, запрещающий URL, идентификаторы, пути, filename, OCR text и raw provider response.
- Версия поднята с `0.10.22` до `0.10.23` только в стандартных version-полях.
- Packaging CI branch filter расширен отдельным CI-only commit.

## Затронутые файлы

- `TarsReportApp.js`
- `app.json`
- `package.json`
- `package-lock.json`
- `tests/work-photo-source-mime-telemetry.runtime.js`
- `tests/scanner2-packaging.test.js`
- `tests/scanner2-runtime-record-only.test.js`
- статические regression tests, обновлённые только для необязательного telemetry-context
- `.github/workflows/scanner2-packaging-ci.yml` — только branch trigger

## Проверки

- SOURCE/MIME telemetry runtime: PASS
- Privacy whitelist: PASS
- Existing WORK_PHOTO diagnostics: PASS
- Scanner/runtime: 22/22 PASS
- Legacy: 77/77 PASS
- Safe deploy workflow: PASS
- Deploy token hygiene: PASS
- `git diff --check`: PASS
- Canonical `build-tars.sh`: PASS
- ZIP: ровно `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, `icon.png`
- Bundle syntax and policy: PASS
- GitHub Actions run `33547544356`: SUCCESS

## Инварианты

- Classification logic changed: NO
- Prompts changed: NO
- Receipt/work-photo gates changed: NO
- Routing changed: NO
- Scanner 2.0 decision engine changed: NO
- Production settings changed: NO

## Риски

Риск регрессии: LOW. Runtime добавляет один bounded whitelist log event и проверяет не более первых 64 байт уже загруженного изображения. Provider retries, timeouts и решения не изменены. Основной эксплуатационный риск — небольшой дополнительный объём диагностических логов.

## Следующий шаг

После review можно отдельно перенести ветку в `develop` и выполнить validation-only workflow. Merge и deploy требуют отдельного разрешения.
