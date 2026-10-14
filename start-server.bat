@echo off
rem Starts a local server and opens the app in your browser.
rem   start-server.bat        mock backend: sign in with any email/password, data resets on refresh
rem   start-server.bat real   real Supabase: values come from .env.local (copy .env.example), never from js\config.js
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js is not installed. Get it from https://nodejs.org
  exit /b 1
)

set PORT=8080
set HOST=localhost
set MOCK=1
if /i "%~1"=="real" set MOCK=0

if "%MOCK%"=="0" (
  if not exist .env.local (
    echo .env.local not found. Copy .env.example to .env.local and add your Supabase URL and key.
    exit /b 1
  )
)

echo Press Ctrl+C to stop the server.
start "" "http://localhost:%PORT%/"
node tests\server.js
