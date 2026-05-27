#!/bin/sh
set -eu

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

APP_NAME="${GAMETRAX_APP_NAME:-GameTrax}"
GAME_NAME="${GAMETRAX_GAME_NAME:-your game}"
DB_NAME="${GAMETRAX_DB_NAME:-gametraxdb}"
SCREENSHOT_PRESETS="${GAMETRAX_SCREENSHOT_PRESETS:-undefined}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__GAMETRAX_CONFIG__ = {
  appName: "$(json_escape "$APP_NAME")",
  gameName: "$(json_escape "$GAME_NAME")",
  databaseName: "$(json_escape "$DB_NAME")",
  screenshotPresets: $SCREENSHOT_PRESETS
};
EOF
