@echo off
chcp 65001 >nul
set NODE_NO_WARNINGS=1
cd /d "%~dp0.."
title PR5 - Task 3 (Monitoring, DevSecOps, load)
node scripts\check-task3.mjs
echo.
pause
