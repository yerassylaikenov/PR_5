@echo off
chcp 65001 >nul
set NODE_NO_WARNINGS=1
cd /d "%~dp0.."
title PR5 - Task 1 (Web3 client / dApp)
node scripts\check-task1.mjs
echo.
echo ----------------------------------------------------------
echo Open the dApp UI: npm run web  (http://localhost:5173)
echo ----------------------------------------------------------
pause
