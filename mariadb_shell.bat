@echo off
title MariaDB Interactive Console - Port 3308
cd /d "%~dp0"
echo =====================================================================
echo    MARIADB 13.0 INTERACTIVE TERMINAL (PORT: 3308 | DB: o2_gym_db)
echo =====================================================================
echo.
echo Type your SQL queries below (e.g. SELECT * FROM members;) and press Enter.
echo Type exit to quit.
echo.
"C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -u root -P 3308 o2_gym_db
