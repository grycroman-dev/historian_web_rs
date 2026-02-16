@echo off
REM -------------------------------
REM 4) Restart aplikace pod PM2
REM -------------------------------
set SERVICE_NAME=historian-audit

echo Restartuji PM2 proces "%SERVICE_NAME%"...
pm2 restart %SERVICE_NAME%

echo Restart dokončen.
pause
