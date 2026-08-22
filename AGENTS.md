# TARS development rules

Baseline: version 0.9.344 on branch main.
Development work: branch develop.

For every task:
1. Do not scan the entire repository unless necessary.
2. Inspect only files relevant to the requested change.
3. Do not modify unrelated functionality.
4. Preserve existing TARS behavior unless explicitly requested.
5. Never deploy automatically.
6. Before editing, identify affected files and dependencies.
7. After editing, show git diff and run only relevant tests.
8. Pay special attention to regressions in:
   - receipts
   - duplicate detection
   - OCR/date/amount recognition
   - reports
   - photos
   - calculations/payroll
   - Rocket.Chat integration
9. Prefer small targeted patches over rewrites.
10. main / version 0.9.344 is the rollback baseline and must not be modified.
