#!/usr/bin/env bash
# Запуск «Вечера игр» на macOS / Linux двойным кликом или из терминала
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Для игры нужен Node.js: https://nodejs.org (версия LTS). Установите и запустите этот файл ещё раз."
  exit 1
fi
[ -d node_modules ] || npm install --no-audit --no-fund
OPEN_BROWSER=1 node server.js
