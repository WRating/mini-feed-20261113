@echo off
setlocal
cd /d "%~dp0"

set "WEB_PORT=5173"
set "API_PORT=8787"
set "URL=http://127.0.0.1:%WEB_PORT%/"

echo.
echo  ============================================
echo   Mini Feed (Vue 3 + Pinia + Hono) - Dev
echo  ============================================
echo   Folder : %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [ERROR] Node.js was not found. Install Node 18+ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   [INFO] node_modules not found, installing dependencies...
  call npm install
  if errorlevel 1 (
    echo   [ERROR] npm install failed. Check your network and try again.
    echo.
    pause
    exit /b 1
  )
)

echo   Frontend : %URL%
echo   Backend  : http://127.0.0.1:%API_PORT%/api/health
echo.
echo   Data lives in the backend memory - restarting the server clears it.
echo   Press Ctrl+C or close this window to stop both services.
echo   --------------------------------------------
echo.

rem ---- Open the browser a moment later, once Vite is up ----
start "" /b cmd /c "ping -n 6 127.0.0.1 >nul & explorer %URL%"

rem npm run dev starts the Hono API and Vite together via concurrently
call npm run dev
