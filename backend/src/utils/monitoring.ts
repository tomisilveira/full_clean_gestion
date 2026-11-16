import * as Sentry from '@sentry/node';

// Monitoreo de errores opcional: solo se activa si hay SENTRY_DSN (compatible con Sentry y
// con servicios que hablan su protocolo, p. ej. GlitchTip). Sin DSN, todo esto es un no-op y
// los errores siguen yendo al log del servidor.
//
// Privacidad: beforeSend elimina el cuerpo, las cabeceras (incluido Authorization), las
// cookies y el usuario del evento, para que ningún dato personal de clientes ni credenciales
// salgan hacia el proveedor. Solo viajan el mensaje, la traza y las etiquetas (requestId).
let enabled = false;

export function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
  });
  enabled = true;
  console.log('🛰️  Monitoreo de errores (Sentry) activado.');
}

export function reportError(error: unknown, context?: { requestId?: string; source?: string }) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context?.requestId) scope.setTag('requestId', context.requestId);
    if (context?.source) scope.setTag('source', context.source);
    Sentry.captureException(error);
  });
}

// Da tiempo a enviar los eventos pendientes antes de que el proceso termine.
export async function flushMonitoring(timeoutMs = 2000) {
  if (enabled) await Sentry.flush(timeoutMs);
}
