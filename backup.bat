@echo off
:: ================================================================
:: backup.bat - Script de Backup Automatico PostgreSQL Full Clean
:: Vuelca la base de datos con pg_dump y timestamp al directorio /backups
:: Configurar en el Programador de Tareas de Windows para ejecucion diaria
:: ================================================================
:: Requiere que pg_dump.exe este en el PATH (se instala junto con PostgreSQL,
:: normalmente en "C:\Program Files\PostgreSQL\<version>\bin").
:: Ajustar las variables debajo segun el entorno (local o servidor remoto).

set PGHOST=127.0.0.1
set PGPORT=5432
set PGUSER=fullclean_app
set PGPASSWORD=fullclean_dev_pw
set PGDATABASE=fullclean_dev

set BACKUP_DIR=%~dp0backups
set TIMESTAMP=%DATE:~6,4%-%DATE:~3,2%-%DATE:~0,2%_%TIME:~0,2%-%TIME:~3,2%-%TIME:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_FILE=%BACKUP_DIR%\fullclean_backup_%TIMESTAMP%.sql

:: Crear directorio de backups si no existe
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: Volcar la base de datos completa (esquema + datos)
pg_dump -h %PGHOST% -p %PGPORT% -U %PGUSER% -d %PGDATABASE% -F p -f "%BACKUP_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo [%DATE% %TIME%] Backup completado: %BACKUP_FILE%
) else (
    echo [%DATE% %TIME%] ERROR: pg_dump fallo. Verificar que este en el PATH y las credenciales.
)

:: Limpiar backups con mas de 30 dias
forfiles /p "%BACKUP_DIR%" /s /m *.sql /d -30 /c "cmd /c del @path" 2>NUL
echo Backups antiguos (mas de 30 dias) eliminados.
