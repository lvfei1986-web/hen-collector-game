@echo off
REM =====================================================================
REM  Hen Collector Game - Quick Launcher
REM  Starts backend server and frontend dev server in separate windows,
REM  waits for readiness, then opens the browser automatically.
REM  Idempotent: services whose port is already listening are skipped.
REM  Encoding-safe: UTF-8 codepage, all ASCII messages to avoid garbled text
REM =====================================================================

REM ---------- Force UTF-8 codepage silently ----------
chcp 65001 >nul 2>&1
setlocal EnableExtensions

REM ---------- Save project root ----------
cd /d "%~dp0"
set "PROJECT_ROOT=%cd%"
set "BACKEND_HEALTH=http://localhost:3001/api/health"
set "FRONTEND_URL=http://localhost:5173"

REM ---------- Check Node.js availability ----------
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo         Download from: https://nodejs.org/
    pause
    exit /b 1
)

REM ---------- Check dependencies (node_modules) ----------
if not exist "%PROJECT_ROOT%\node_modules" (
    echo [INFO] node_modules not found. Running 'npm install' first...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed. Please check network and try again.
        pause
        exit /b 1
    )
)

echo ============================================================
echo   Hen Collector Game Launcher
echo   Project: %PROJECT_ROOT%
echo ============================================================
echo.

REM ---------- Detect services already running (idempotent start) ----------
set "BACKEND_RUNNING=0"
set "FRONTEND_RUNNING=0"
set "FRONTEND_OK=0"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 set "BACKEND_RUNNING=1"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 set "FRONTEND_RUNNING=1"

REM ---------- Backend ----------
if "%BACKEND_RUNNING%"=="1" (
    echo [SKIP] Backend already running on port 3001.
) else (
    echo [1/2] Starting Backend server: npm run server ^(port 3001^)
    start "Hen-Game Backend (port 3001)" cmd /k "chcp 65001 >nul & cd /d ""%PROJECT_ROOT%"" && echo === Backend: node server/index.js (port 3001) === && echo Close this window to stop backend. && echo. && npm run server"
    call :wait_for_url "%BACKEND_HEALTH%" 15
    if errorlevel 1 (
        echo [WARN] Backend health check not confirmed yet; continuing anyway.
    ) else (
        echo [ OK ] Backend is healthy.
    )
)

REM ---------- Frontend ----------
if "%FRONTEND_RUNNING%"=="1" (
    echo [SKIP] Frontend already running on port 5173.
    set "FRONTEND_OK=1"
) else (
    echo [2/2] Starting Frontend dev server: npm run dev ^(Vite^)
    start "Hen-Game Frontend (Vite)" cmd /k "chcp 65001 >nul & cd /d ""%PROJECT_ROOT%"" && echo === Frontend: Vite dev server === && echo Close this window to stop frontend. && echo. && npm run dev"
    call :wait_for_url "%FRONTEND_URL%" 30
    if errorlevel 1 (
        echo [WARN] Frontend not confirmed yet; check the Vite window for details.
    ) else (
        echo [ OK ] Frontend is up.
        set "FRONTEND_OK=1"
    )
)

echo.
echo [DONE] Backend : http://localhost:3001
echo        Frontend: %FRONTEND_URL%
echo.

REM ---------- Open browser only when frontend is reachable ----------
if "%FRONTEND_OK%"=="1" start "" "%FRONTEND_URL%"

timeout /t 2 /nobreak >nul 2>&1
endlocal
exit /b 0

:wait_for_url
REM %1 = URL to poll, %2 = max seconds to wait
setlocal
set "URL=%~1"
set /a TRIES=%~2 * 2
for /l %%i in (1,1,%TRIES%) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%'; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        endlocal
        exit /b 0
    )
    timeout /t 1 /nobreak >nul 2>&1
)
endlocal
exit /b 1
