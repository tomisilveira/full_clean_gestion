@echo off
:: ================================================================
:: backup.bat - Script de Backup Automatico PostgreSQL Full Clean
:: Vuelca la base de datos con pg_dump y timestamp al directorio /backups
:: Configurar en el Programador de Tareas de Windows para ejecucion diaria
:: ================================================================
:: Requiere que pg_dump.exe este en el PATH (se instala junto con PostgreSQL,
:: normalmente en "C:\Program Files\PostgreSQL\<version>\bin").
:: Ajustar las variables debajo segun el entorno (local o servidor remoto).
::
:: La contrasena NO va en este archivo (esta en un repositorio publico): definir la
:: variable de entorno PGPASSWORD en el sistema (o en la tarea programada) antes de correrlo,
:: o usar un archivo pgpass.conf (https://www.postgresql.org/docs/current/libpq-pgpass.html).

if not defined PGHOST set PGHOST=127.0.0.1
if not defined PGPORT set PGPORT=5432
if not defined PGUSER set PGUSER=fullclean_app
if not defined PGDATABASE set PGDATABASE=fullclean_dev

if not defined PGPASSWORD (
    echo [%DATE% %TIME%] ERROR: falta definir la variable de entorno PGPASSWORD.
    exit /b 1
)

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
