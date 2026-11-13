@echo off
setlocal
cd /d "%~dp0"

set "PORT=5173"
set "URL=http://127.0.0.1:%PORT%/"

echo.
echo  ============================================
echo   Mini Feed (Vue 3 + Pinia) - Dev Server
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

echo   Address : %URL%
echo.
echo   Data is stored in your browser (Local Storage).
echo   Press Ctrl+C or close this window to stop.
echo   --------------------------------------------
echo.

rem ---- Open the browser a moment later, once Vite is up ----
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & explorer %URL%"

call npm run dev
