import { api } from '../services/api';

// Los endpoints de ticket requieren JWT (Authorization: Bearer), que un <a href target="_blank">
// normal no puede enviar. Por eso lo pedimos con axios (que sí adjunta el token) y volcamos
// el HTML resultante en una pestaña nueva ya abierta por el propio click del usuario
// (abrirla ANTES del await evita que el navegador la bloquee como pop-up).
export async function openTicketPreview(saleId: number) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana del ticket. Habilitá los pop-ups para este sitio.');
    return;
  }
  win.document.write('Generando ticket...');

  try {
    const res = await api.get(`/tickets/sale/${saleId}/html`, { responseType: 'text' });
    win.document.open();
    win.document.write(res.data);
    win.document.close();
  } catch (err: any) {
    win.document.open();
    win.document.write(`<pre>Error al generar el ticket: ${err.response?.data || err.message}</pre>`);
    win.document.close();
  }
}
