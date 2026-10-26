#!/bin/sh
# Builds the zip to upload in the Chrome Web Store Developer Dashboard.
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./extension/manifest.json').version")
mkdir -p dist
rm -f "dist/pointfix-$VERSION.zip"
(cd extension && zip -r -X "../dist/pointfix-$VERSION.zip" . -x '.*')
echo "dist/pointfix-$VERSION.zip"
