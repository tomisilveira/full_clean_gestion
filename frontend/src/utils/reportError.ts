import axios from 'axios';

// Reporta errores de la interfaz al backend (POST /api/client-errors), que los deja en el log
// del servidor y, si hay monitoreo configurado, en Sentry. No se envía nada de la sesión ni
// del usuario: solo mensaje, traza y la ruta actual.
//
// Tope por sesión para que un error que se repite en bucle no sature al servidor.
const MAX_REPORTS_PER_SESSION = 5;
let sent = 0;

export function reportClientError(error: unknown, componentStack?: string) {
  // Los fallos de llamadas a la API (red, 4xx, 5xx) ya los maneja cada pantalla con su aviso
  // y el servidor los registra del otro lado: reportarlos acá solo duplicaría el ruido.
  if (axios.isAxiosError(error)) return;
  if (sent >= MAX_REPORTS_PER_SESSION) return;
  sent += 1;

  const err = error instanceof Error ? error : new Error(String(error));
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: err.message.slice(0, 500),
        stack: err.stack?.slice(0, 4000),
        componentStack: componentStack?.slice(0, 4000),
        path: window.location.pathname.slice(0, 200),
      }),
      keepalive: true,
    }).catch(() => {
      // si el reporte falla no hay nada más que hacer: nunca debe romper la app
    });
  } catch {
    // idem
  }
}

// Errores que ningún componente atrapó: excepciones globales y promesas rechazadas sin catch.
export function installGlobalErrorReporting() {
  window.addEventListener('error', (event) => reportClientError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason));
}
