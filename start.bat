@echo off
setlocal
cd /d "%~dp0"

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%/index.html"

echo.
echo  ============================================
echo   Mini Feed - Local Server Launcher
echo  ============================================
echo   Folder : %CD%
echo.

rem ---- If the port is already listening, just open the browser ----
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo   [INFO] Port %PORT% is already in use, opening the page...
  start "" "%URL%"
  timeout /t 3 >nul
  exit /b 0
)

rem ---- Pick an available runtime ----
set "RUNNER="
python -c "import sys" >nul 2>&1 && set "RUNNER=python"
if not defined RUNNER (
  py -3 -c "import sys" >nul 2>&1 && set "RUNNER=py -3"
)
if not defined RUNNER (
  node --version >nul 2>&1 && set "RUNNER=node"
)

if not defined RUNNER (
  echo   [ERROR] Python or Node.js was not found.
  echo           Install one of them and run this file again.
  echo.
  pause
  exit /b 1
)

echo   Runtime : %RUNNER%
echo   Address : %URL%
echo.
echo   Data is stored in your browser (Local Storage).
echo   Close this window to stop the server.
echo   --------------------------------------------
echo.

rem ---- Open the browser a moment later, once the server is up ----
start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & explorer %URL%"

if /i "%RUNNER%"=="node" (
  node serve.js %PORT%
) else (
  %RUNNER% -m http.server %PORT%
)

echo.
echo   Server stopped. Press any key to close.
pause >nul
