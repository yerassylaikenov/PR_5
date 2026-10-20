@echo off
chcp 65001 >nul
set NODE_NO_WARNINGS=1
cd /d "%~dp0.."
title PR5 - Task 2 (Verification and security)
node scripts\check-task2.mjs
echo.
pause
