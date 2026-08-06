@echo off
echo ============================================
echo    Full Clean Gestion - Inicio del Sistema
echo ============================================
echo.

:: Iniciar Backend en nueva ventana
echo Iniciando Backend (API) en puerto 4000...
start "Full Clean - Backend API" cmd /k "cd /d %~dp0backend && npm run dev"

:: Esperar 3 segundos para que el backend arranque
timeout /t 3 /nobreak > NUL

:: Iniciar Frontend en nueva ventana
echo Iniciando Frontend (UI) en puerto 5173...
start "Full Clean - Frontend UI" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo  Servidores iniciados:
echo   Backend API:  http://localhost:4000
echo   Frontend UI:  http://localhost:5173
echo ============================================
echo.
echo Abriendo el navegador...
timeout /t 2 /nobreak > NUL
start http://localhost:5173
