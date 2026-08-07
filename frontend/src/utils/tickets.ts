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

// Mismo problema que el ticket: el endpoint de PDF exige el JWT por header, y un <a href
// target="_blank"> normal no lo manda, así que el navegador solo veía un 401 en vez de
// abrir el PDF. Lo pedimos como blob con axios (que sí adjunta el token) y lo volcamos
// a una pestaña ya abierta por el click del usuario.
export async function openBudgetPdf(budgetId: number) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana del presupuesto. Habilitá los pop-ups para este sitio.');
    return;
  }
  win.document.write('Generando presupuesto...');

  try {
    const res = await api.get(`/budgets/${budgetId}/pdf`, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    win.location.href = blobUrl;
  } catch (err: any) {
    let message = err.message;
    // El body de un error de axios con responseType 'blob' viene como Blob, no como JSON:
    // hay que leerlo aparte para mostrar el mensaje real del backend.
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        message = JSON.parse(text)?.error || text;
      } catch {
        // si no se puede parsear, se usa err.message tal cual
      }
    }
    win.document.open();
    win.document.write(`<pre>Error al generar el presupuesto: ${message}</pre>`);
    win.document.close();
  }
}
