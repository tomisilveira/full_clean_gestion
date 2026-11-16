// Debe ser el primer import: carga backend/.env antes de que otros módulos (ej.
// middleware/auth.ts, que exige JWT_SECRET al cargarse) lean process.env.
import 'dotenv/config';
import { initMonitoring, reportError, flushMonitoring } from './utils/monitoring';
import { app } from './app';

initMonitoring();

const PORT = process.env.PORT || 4000;

// Sin estos handlers, una promesa rechazada sin catch o una excepción fuera de un request
// terminaba el proceso sin dejar rastro útil. Se registra el error (y se reporta si hay
// monitoreo). Una excepción no capturada deja el proceso en estado indefinido: se sale con
// código 1 para que el hosting (Render, systemd, pm2) lo reinicie limpio.
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  reportError(reason, { source: 'unhandledRejection' });
});

process.on('uncaughtException', async (error) => {
  console.error('uncaughtException:', error);
  reportError(error, { source: 'uncaughtException' });
  await flushMonitoring();
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor backend Full Clean corriendo en http://localhost:${PORT}`);
});
