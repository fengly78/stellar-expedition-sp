@echo off
rem dev-serve.cmd - one-click dev environment (game-server :8099 + web PWA :5180)
rem NOTE: keep this file ASCII-only. cmd.exe parses batch files in the ANSI
rem codepage (GBK on zh-CN); UTF-8 Chinese text corrupts line parsing.
setlocal
set PATH=%LOCALAPPDATA%\Programs\php;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%
cd /d "%~dp0.."

echo === game-server: migrate + seed dev ruleset + serve :8099 ===
cd game-server
if not exist database\database.sqlite type nul > database\database.sqlite
php artisan migrate --force >nul 2>&1
php artisan game:seed-dev-ruleset >nul 2>&1
start "game-server :8099" /min php artisan serve --host=127.0.0.1 --port=8099
cd ..

echo === web PWA: vite dev :5180 ===
cd web
start "web-pwa :5180" /min node node_modules\vite\bin\vite.js --port 5180 --strictPort
cd ..

echo.
echo Ready:
echo   PWA        http://localhost:5180   (main menu - server mode)
echo   game API   http://127.0.0.1:8099/api/v1/health
echo   Token: cd game-server ^&^& php artisan game:issue-token OWNER_ID
echo (two minimized windows run the servers; close a window to stop it)
endlocal
