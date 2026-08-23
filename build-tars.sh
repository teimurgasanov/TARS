#!/bin/zsh
set -e
VERSION=$(python3 -c 'import json; print(json.load(open("app.json"))["version"])')
OUT="tars-report_${VERSION}.zip"
rm -f "$OUT"
zip -j "$OUT" app.json TarsReportApp.js en.json ru.json icon.png
echo "READY: $OUT"
