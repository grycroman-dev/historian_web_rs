@echo off
REM ------------------------------
REM 3) Zastavení aplikace pod PM2
REM ------------------------------
set SERVICE_NAME=historian-audit

echo Zastavuji PM2 proces "%SERVICE_NAME%"...
pm2 stop %SERVICE_NAME%

echo Proces zastaven.
pause
