#!/bin/sh
# Rebuilds the Chrome Web Store screenshots (1280x800, no alpha) from the real
# panel code, using a staged demo page and headless Chrome.
set -e
cd "$(dirname "$0")/../store/screenshots"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PROFILE="$(mktemp -d)"
trap 'rm -rf "$PROFILE" panel-full.png panel.png' EXIT
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" --virtual-time-budget=4000 "$@" >/dev/null 2>&1; }

# 2: the panel in context on the demo page
shot --force-device-scale-factor=1 --window-size=1280,800 --screenshot="$PWD/screenshot-2.png" "file://$PWD/demo-app.html"
# Tall panel (diff expanded) on a transparent background, cropped out at 2x
shot --force-device-scale-factor=2 --default-background-color=00000000 --window-size=1280,1010 --screenshot="$PWD/panel-full.png" "file://$PWD/demo-app.html#panel"
sips --cropOffset 4 1660 -c 1900 896 panel-full.png --out panel.png >/dev/null
# 1: headline + panel
shot --force-device-scale-factor=1 --window-size=1280,800 --screenshot="$PWD/screenshot-1.png" "file://$PWD/headline.html"
sips -g pixelWidth -g pixelHeight -g hasAlpha screenshot-1.png screenshot-2.png | grep -E 'png|pixel|Alpha'
