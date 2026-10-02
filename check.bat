@echo off
rem check.bat
rem Double-click this to run every check before a release (see scripts/check.mjs):
rem type checking, unit tests, the database schema against an in-memory
rem Postgres, the production build, and a browser smoke test with Supabase
rem fully mocked (it never touches the real database or creates accounts).
cd /d "%~dp0"
call pnpm run check
echo.
pause
