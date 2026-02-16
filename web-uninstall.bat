@echo off
REM ----------------------------------------
REM Skript pro odinstalaci PM2 služby
REM ----------------------------------------

REM Název vaší PM2 aplikace
set SERVICE_NAME=historian-audit

REM (Volitelné) Kořenová složka vašeho projektu
set APP_DIR=D:\Temp\Historian_web

echo.
echo Zastavuji PM2 proces "%SERVICE_NAME%"...
pm2 stop %SERVICE_NAME% 2>nul

echo Odstraňuji PM2 proces "%SERVICE_NAME%"...
pm2 delete %SERVICE_NAME% 2>nul

echo Ukládám prázdný seznam procesů PM2...
pm2 save

echo.
echo Odinstalace Windows startup integrace PM2...
pm2-startup uninstall

rem echo.
rem echo (Volitelné) Odebírám globální balíčky pm2 a pm2-windows-startup...
rem npm uninstall -g pm2 pm2-windows-startup

echo.
echo Hotovo. Stiskněte klávesu pro uzavčení okna.
pause
