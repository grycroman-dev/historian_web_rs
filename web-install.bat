@echo off
REM ----------------------------------------
REM 1) Instalace PM2 + konfigurace jako služba
REM ----------------------------------------
set SERVICE_NAME=historian-audit
set APP_SCRIPT=server.js
set APP_DIR=D:\Temp\Historian_web

echo Přechod do složky projektu...
cd /d %APP_DIR%

echo Instalace PM2 a pm2-windows-startup...
npm install -g pm2 pm2-windows-startup

echo Spouštím aplikaci v PM2...
pm2 start %APP_SCRIPT% --name %SERVICE_NAME%

echo Ukládám procesy PM2 pro automatický restart...
pm2 save

echo Nastavuji PM2 jako Windows službu...
pm2-startup install

echo Hotovo! PM2 služba nainstalována a nakonfigurována.
pause
