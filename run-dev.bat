@echo off
title riasly dev launcher
setlocal

REM ============================================================
REM  riasly - safe local dev launcher
REM  Double-click to start the site at http://localhost:3000
REM  Steps: check node, free port 3000, ensure .env, ensure deps,
REM         clear stale .next, open browser, run npm dev.
REM  NOTE: messages stay ASCII-only and avoid parentheses on echo
REM        lines - both can break cmd parsing inside if-blocks.
REM ============================================================

REM Always run from the folder that holds this file.
cd /d "%~dp0"

echo.
echo [1/6] Checking Node.js ...
where node >nul 2>&1
if errorlevel 1 goto :nonode

echo [2/6] Freeing port 3000 - stopping anything LISTENING on it ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)

echo [3/6] Checking environment file ...
if exist ".env" echo   .env present.
if not exist ".env" if exist ".env.example" (
  copy ".env.example" ".env" >nul
  echo   NOTE: .env was missing - created from .env.example.
  echo   Fill DATABASE_URL [MySQL] and AUTH_SECRET before using DB pages.
)
if not exist ".env" if not exist ".env.example" echo   WARNING: no .env and no .env.example found.

echo [4/6] Checking dependencies ...
if exist "node_modules\" (
  echo   node_modules present.
)
if not exist "node_modules\" (
  echo   node_modules missing - running npm install, first run only ...
  call npm install
  if errorlevel 1 goto :npmfail
)

echo [5/6] Clearing stale build cache .next ...
if exist ".next" rmdir /s /q ".next"

echo [6/6] Starting dev server ...
echo.
echo   Site will be at: http://localhost:3000
echo   Keep this window open. Press Ctrl+C to stop the server.
echo.

REM Open the browser after a short delay so Next.js has time to boot.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"

call npm run dev
goto :eof

:nonode
echo   ERROR: node was not found on PATH.
echo   Install Node.js from https://nodejs.org then re-run this file.
pause
exit /b 1

:npmfail
echo   ERROR: npm install failed.
pause
exit /b 1
