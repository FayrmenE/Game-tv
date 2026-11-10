@echo off
chcp 65001 >nul
title Вечер игр
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Для игры нужен Node.js — его пока нет на этом компьютере.
  where winget >nul 2>nul
  if not errorlevel 1 (
    echo   Устанавливаю Node.js через winget... Подтвердите установку, если Windows спросит.
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    echo.
    echo   Готово. Закройте это окно и запустите файл ещё раз.
  ) else (
    echo   Сейчас откроется страница загрузки. Установите версию LTS и запустите этот файл ещё раз.
    start "" "https://nodejs.org/ru/download"
  )
  echo.
  pause
  exit /b
)

if not exist "node_modules\" (
  echo   Первый запуск: устанавливаю компоненты, это займёт минуту...
  call npm install --no-audit --no-fund
)

set OPEN_BROWSER=1
echo.
echo   Не закрывайте это окно, пока играете. Остановить игру: Ctrl+C или закрыть окно.
node server.js
pause
