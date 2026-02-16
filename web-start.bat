@echo off
REM -----------------------------
REM 2) Spuštění aplikace pod PM2
REM -----------------------------
set SERVICE_NAME=historian-audit

echo Spouštím PM2 proces "%SERVICE_NAME%"...
pm2 start %SERVICE_NAME%

echo Proces spuštěn.
pause
