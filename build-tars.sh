#!/bin/zsh
set -eu

ROOT_DIR="${0:A:h}"
BUILD_DIR="$ROOT_DIR/.build"
BUNDLE_PATH="$BUILD_DIR/TarsReportApp.js"
VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT_DIR/app.json")
OUT="$ROOT_DIR/tars-report_${VERSION}.zip"
ZIP_TEMP="$BUILD_DIR/tars-report_${VERSION}.zip"
SOURCE_SHA=$(shasum -a 256 "$ROOT_DIR/TarsReportApp.js" | awk '{print $1}')

cleanup() {
  if [[ "$BUILD_DIR" == "$ROOT_DIR/.build" ]]; then
    rm -rf -- "$BUILD_DIR"
  fi
}
trap cleanup EXIT INT TERM

cleanup
mkdir -p "$BUILD_DIR"

"$ROOT_DIR/node_modules/.bin/esbuild" \
  "$ROOT_DIR/tools/tars-build-entry.js" \
  --bundle \
  --minify \
  --platform=node \
  --target=node20 \
  '--external:@rocket.chat/apps-engine/*' \
  --outfile="$BUNDLE_PATH"

node --check "$BUNDLE_PATH"
node "$ROOT_DIR/tools/verify-tars-bundle.js" "$BUNDLE_PATH"

if [[ "$SOURCE_SHA" != "$(shasum -a 256 "$ROOT_DIR/TarsReportApp.js" | awk '{print $1}')" ]]; then
  echo "ERROR: tracked TarsReportApp.js changed during build" >&2
  exit 1
fi

zip -q -j "$ZIP_TEMP" \
  "$ROOT_DIR/app.json" \
  "$BUNDLE_PATH" \
  "$ROOT_DIR/en.json" \
  "$ROOT_DIR/ru.json" \
  "$ROOT_DIR/icon.png"

unzip -t "$ZIP_TEMP"
mv -f "$ZIP_TEMP" "$OUT"
echo "READY: $OUT"
