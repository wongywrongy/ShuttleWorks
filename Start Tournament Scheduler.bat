@echo off
REM Tournament Scheduler launcher for Windows.
REM Double-click to start. Leave this window open while the tournament runs.
setlocal

cd /d "%~dp0"

echo.
echo   Tournament Scheduler
echo.

where docker >nul 2>nul
if errorlevel 1 (
    powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Docker isn''t installed.' + [Environment]::NewLine + [Environment]::NewLine + 'Tournament Scheduler runs in Docker. Install Docker Desktop, then run this launcher again.', 'Docker not found', 'OK', 'Warning') | Out-Null"
    start "" https://www.docker.com/products/docker-desktop/
    echo Docker not found. Install Docker Desktop and try again.
    pause
    exit /b 1
)

set COMPOSE_FILE=docker-compose.yml
if exist docker-compose.release.yml set COMPOSE_FILE=docker-compose.release.yml
echo Using %COMPOSE_FILE%.

echo Starting containers...
docker compose -f %COMPOSE_FILE% up -d
if errorlevel 1 (
    echo.
    echo Failed to start containers.
    pause
    exit /b 1
)

echo.
echo Waiting for the app to become ready...
set /a tries=0
:waitloop
curl -sf http://localhost:8000/health/deep | findstr /C:"\"status\":\"healthy\"" >nul 2>nul
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% GEQ 60 goto timeout
timeout /t 1 /nobreak >nul
goto waitloop

:ready
echo Ready.
start "" http://localhost
echo.
echo   Tournament Scheduler is running at http://localhost
echo   Leave this window open during the tournament.
echo   To stop: run "Stop Tournament Scheduler.bat" or close this window.
:holdopen
timeout /t 30 /nobreak >nul
docker compose -f %COMPOSE_FILE% ps --quiet backend >nul 2>nul
if errorlevel 1 goto end
goto holdopen

:timeout
echo.
echo Timed out waiting for the backend to become healthy.
echo Try: docker compose -f %COMPOSE_FILE% logs backend
pause
exit /b 1

:end
endlocal
