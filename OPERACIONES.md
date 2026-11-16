# Operación y respuesta a incidentes

Guía corta para tener el sistema en producción: qué monitorear, cómo enterarse de los errores, cómo volver atrás un deploy malo y cómo comprobar que los backups sirven.

## 1. Monitoreo de disponibilidad

El endpoint `GET /api/health` devuelve `200 {"status":"OK","db":"up"}` si el servidor **y la base de datos** responden, y `503 {"status":"DEGRADED","db":"down"}` si Postgres no contesta en 3 segundos. No requiere login.

Configurar un monitor externo (UptimeRobot, Better Stack, Healthchecks, el health check de Render, etc.):

| Dato | Valor |
|---|---|
| URL | `https://TU_DOMINIO/api/health` |
| Frecuencia | cada 5 minutos (1 minuto si el plan lo permite) |
| Alerta | por email/WhatsApp a quien administra el sistema, cuando falle 2 chequeos seguidos |
| Palabra clave (opcional) | `"db":"up"` |

> En el plan gratis de Render el servicio "duerme" tras ~15 minutos sin uso. Un monitor cada 5 minutos lo mantiene despierto como efecto secundario; si no querés eso, usá un plan pago.

## 2. Monitoreo de errores

- **Siempre activo**: los errores inesperados quedan en el log del servidor (`Error no controlado [requestId]`) y la respuesta 500 incluye un `requestId`. Cuando alguien reporte un error, pedile ese código y buscalo en los logs.
- **Errores de la pantalla**: el navegador los envía a `POST /api/client-errors` (con tope por sesión y por IP); aparecen en el log como `[client-error]`.
- **Sentry (opcional)**: definí `SENTRY_DSN` y los errores del servidor y de la interfaz se reportan además a Sentry (o a un servicio compatible como GlitchTip). Se eliminan cuerpo, cabeceras, cookies y usuario del evento: solo viaja el mensaje, la traza y el `requestId`. Si lo activás, descomentá su entrada en `frontend/src/legal/providers.ts` (la lista pública de proveedores) para que la política de privacidad siga siendo cierta.
- Los errores del proceso (`unhandledRejection`, `uncaughtException`) se registran; una excepción no capturada termina el proceso con código 1 para que el hosting lo reinicie limpio.

## 3. Backups y restauración

- **Backup**: `backup.bat` (pg_dump, diario con el Programador de Tareas) o, en Render/Neon, las herramientas del proveedor.
- **Verificar que se pueda restaurar** (hacerlo al menos una vez por trimestre y antes de cambios grandes):

  ```bash
  cd backend
  npm run backup:verify
  ```

  Hace un `pg_dump` de la base de `DATABASE_URL`, lo restaura en una base temporal, compara las filas de cada tabla y borra la temporal. No modifica tu base. Si `pg_dump` no está en el PATH: `PG_BIN="C:\Program Files\PostgreSQL\17\bin"`. Necesita permiso para crear bases de datos.
- **Restaurar en un incidente real**: crear una base nueva, `psql -d NUEVA -f backup.sql`, apuntar `DATABASE_URL` a la nueva y reiniciar. El export JSON de *Configuración → Exportar* es una copia legible de los datos, **no** un formato de restauración.
- Guardar copias **fuera** del servidor (otro disco, nube) y probar el acceso a ellas.

## 4. Plan de rollback de un deploy

Regla de oro: **las migraciones de Prisma solo avanzan**. Para poder volver el código atrás sin romper nada:

1. **Cambios de base en dos pasos** (expandir y luego contraer). En un release se *agregan* columnas/tablas (nullable o con default) y el código nuevo las usa; recién en un release posterior, cuando ya no hay vuelta atrás, se eliminan o renombran las viejas. Nunca borrar ni renombrar una columna en el mismo release que cambia el código que la usa.
2. **Antes de un deploy con migración**: correr `npm run backup:verify` (o crear una rama/backup en el proveedor) para tener un punto de retorno comprobado.
3. **Si el deploy sale mal pero la migración fue compatible** (lo normal): volver al deploy anterior desde el panel del hosting (en Render: *Deploys → deploy anterior → Rollback*). El código viejo funciona con el esquema nuevo gracias al paso 1.
4. **Si la migración en sí es el problema**: restaurar la base desde el punto de retorno (sección 3, o la restauración a un punto en el tiempo del proveedor, según el plan) y volver el código al deploy anterior. Se pierden los datos cargados después del punto de retorno: por eso el paso 2.
5. **Verificación posterior a cada deploy** (2 minutos): `GET /api/health` en `OK`, iniciar sesión, abrir una pantalla de ventas, y revisar el log de errores.

## 5. Permisos mínimos de la base de datos

Producción debería usar **dos roles**: uno dueño del esquema que corre las migraciones, y otro, con permisos mínimos, que usa la aplicación en `DATABASE_URL`. Ejemplo (ejecutar como el rol dueño/administrador):

```sql
CREATE ROLE fullclean_app LOGIN PASSWORD '<contraseña-larga-y-única>';
GRANT CONNECT ON DATABASE <base> TO fullclean_app;
GRANT USAGE ON SCHEMA public TO fullclean_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fullclean_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fullclean_app;
-- Para tablas futuras creadas por el rol que corre las migraciones:
ALTER DEFAULT PRIVILEGES FOR ROLE <rol_migraciones> IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fullclean_app;
ALTER DEFAULT PRIVILEGES FOR ROLE <rol_migraciones> IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fullclean_app;
```

Las migraciones (`npx prisma migrate deploy`) se corren con el rol dueño; la aplicación, con `fullclean_app`. Tené en cuenta que `npm start` ejecuta `migrate deploy` al arrancar: para separar los roles, mové ese paso al comando de build/release de tu hosting.

## 6. Soporte

Quienes usan el sistema ven un enlace **Soporte** (al email de la empresa configurado en *Configuración → Empresa*) en el login y en el menú. Para diagnosticar, pedir: qué estaba haciendo, hora aproximada y el `requestId` si la pantalla mostró uno.
