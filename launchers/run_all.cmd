@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title PR5 - launch all windows
echo Opening a separate terminal window for each task...
echo (Requires a running node: npm run node, and deployment: npm run deploy:local + npm run seed)
echo.
start "PR5 Task 1" cmd /k "chcp 65001 >nul && set NODE_NO_WARNINGS=1 && cd /d "%~dp0.." && node scripts\check-task1.mjs"
start "PR5 Task 2" cmd /k "chcp 65001 >nul && set NODE_NO_WARNINGS=1 && cd /d "%~dp0.." && node scripts\check-task2.mjs"
start "PR5 Task 3" cmd /k "chcp 65001 >nul && set NODE_NO_WARNINGS=1 && cd /d "%~dp0.." && node scripts\check-task3.mjs"
echo Done - three windows opened (one per task).
timeout /t 3 >nul
