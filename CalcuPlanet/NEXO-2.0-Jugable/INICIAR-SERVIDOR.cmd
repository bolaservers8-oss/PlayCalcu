@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Instala Node.js 20 o superior para el servidor. El solitario NO lo necesita. & pause & exit /b 1)
echo Abri http://localhost:2567 cuando aparezca NEXO listo.
node server.js
pause
