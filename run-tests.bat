@echo off
rem Runs the Playwright test suite. Extra arguments are passed through, e.g.:
rem   run-tests.bat                      all tests (desktop + mobile)
rem   run-tests.bat --project=chromium   desktop only
rem   run-tests.bat tests/plan.spec.js   one file
rem   run-tests.bat --ui                 interactive runner
rem   run-tests.bat --headed             watch the browser
setlocal
cd /d "%~dp0"

where node >nul 2>nul || (
  echo Node.js is not installed. Get it from https://nodejs.org
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install || exit /b 1
)

rem No-op when the browser is already installed.
call npx playwright install chromium || exit /b 1

call npx playwright test %*
set RESULT=%ERRORLEVEL%

if not "%RESULT%"=="0" (
  echo.
  echo Some tests failed. Opening the HTML report...
  call npx playwright show-report
)

exit /b %RESULT%
