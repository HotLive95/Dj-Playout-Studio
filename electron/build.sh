#!/usr/bin/env bash
# Build the Hot Live 95 Playout Studio desktop app.
# Usage:
#   ./build.sh            -> build the React UI + package for THIS operating system
#   ./build.sh win        -> Windows portable .exe + installer (run on Windows)
#   ./build.sh mac        -> macOS .dmg + .zip (run on a Mac)
#   ./build.sh linux      -> Linux AppImage
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
ELECTRON="$ROOT/electron"
TARGET="${1:-current}"

echo "==> [1/4] Building the Hot Live 95 web UI (relative paths for offline use)..."
cd "$FRONTEND"
PUBLIC_URL=./ yarn build

echo "==> [2/4] Copying UI into the Electron app..."
rm -rf "$ELECTRON/renderer"
cp -r "$FRONTEND/build" "$ELECTRON/renderer"

echo "==> [3/4] Installing Electron dependencies..."
cd "$ELECTRON"
if [ ! -d node_modules ]; then
  (yarn install || npm install)
fi

echo "==> [4/4] Packaging desktop app ($TARGET)..."
case "$TARGET" in
  win)   npx electron-builder --win portable nsis ;;
  mac)   npx electron-builder --mac dmg zip ;;
  linux) npx electron-builder --linux AppImage ;;
  *)     npx electron-builder ;;
esac

echo ""
echo "==> Done! Your shareable app is in: $ELECTRON/dist"
ls -la "$ELECTRON/dist" 2>/dev/null || true
