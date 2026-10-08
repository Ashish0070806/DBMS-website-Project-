@echo off
title O2 Gym OS - MariaDB Live Inspector
cd /d "%~dp0"
:top
cls
echo =====================================================================
echo           O2 GYM OS - MARIADB (PORT 3308) LIVE DATABASE SNAPSHOT
echo =====================================================================
echo.
echo [1] ATHLETES ROSTER IN MARIADB (members table):
echo ---------------------------------------------------------------------
"C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -u root -P 3308 -e "USE o2_gym_db; SELECT m.id, m.member_code, u.full_name, u.email, m.status, m.dues_inr FROM members m JOIN users u ON m.user_id = u.id ORDER BY m.id DESC;"
echo.
echo [2] RECENT TRIGGER EVENTS (Insert / Update / Delete in MariaDB):
echo ---------------------------------------------------------------------
"C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -u root -P 3308 -e "USE o2_gym_db; SELECT id, event_type, table_name, message, created_at FROM db_events ORDER BY id DESC LIMIT 5;"
echo.
echo [3] RECENT AUDIT LOGS:
echo ---------------------------------------------------------------------
"C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -u root -P 3308 -e "USE o2_gym_db; SELECT id, action, created_at FROM audit_logs ORDER BY id DESC LIMIT 5;"
echo.
echo =====================================================================
echo Press any key to refresh, or close this window to exit.
pause >nul
goto :top
