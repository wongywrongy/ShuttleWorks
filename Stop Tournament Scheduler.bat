@echo off
REM Stop the running Tournament Scheduler containers. Double-click to run.
setlocal
cd /d "%~dp0"

echo Stopping Tournament Scheduler...
if exist docker-compose.release.yml docker compose -f docker-compose.release.yml down
docker compose -f docker-compose.yml down

echo Stopped.
pause
endlocal
