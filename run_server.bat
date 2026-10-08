@echo off
title O2 Gym OS - Local Server Launcher
cd /d "%~dp0"
echo =====================================================================
echo           O2 GYM OS - DATABASE MANAGEMENT & OPERATOR TERMINAL
echo =====================================================================
echo.
echo Launching local web server...
echo Local URL : http://localhost:8000
echo Network   : http://127.0.0.1:8000
echo.
echo [NOTE] If Apache / XAMPP is running, you can also access:
echo        http://localhost/o2-gym-os/
echo.
echo [IMPORTANT] Keep this terminal window open while using the application.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8000"
set PHP_CLI_SERVER_WORKERS=4
php -S 0.0.0.0:8000
pause
