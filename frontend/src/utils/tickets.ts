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
    // La ventana hereda la CSP de la app (sin scripts inline), así que el ticket ya no trae
    // onload/onclick: se enganchan los botones desde acá y se dispara la impresión.
    win.document.getElementById('btn-print')?.addEventListener('click', () => win.print());
    win.document.getElementById('btn-close')?.addEventListener('click', () => win.close());
    // Imprimir recién al terminar de cargar (logo y QR son imágenes externas), como hacía
    // el onload="window.print()" original.
    win.addEventListener('load', () => {
      win.focus();
      win.print();
    });
  } catch (err: any) {
    showWindowError(win, 'Error al generar el ticket', err.response?.data || err.message);
  }
}

// Escribe un mensaje de error en la ventana como TEXTO (textContent), nunca como HTML: el
// mensaje puede venir del servidor y la ventana comparte origen con la app (y su token).
function showWindowError(win: Window, title: string, detail: unknown) {
  win.document.open();
  win.document.write('<pre id="err"></pre>');
  win.document.close();
  const pre = win.document.getElementById('err');
  if (pre) pre.textContent = `${title}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
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
    showWindowError(win, 'Error al generar el presupuesto', message);
  }
}

// Mismo patrón que openBudgetPdf, para las facturas libres.
export async function openManualInvoicePdf(invoiceId: number) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana de la factura. Habilitá los pop-ups para este sitio.');
    return;
  }
  win.document.write('Generando factura...');

  try {
    const res = await api.get(`/manual-invoices/${invoiceId}/pdf`, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    win.location.href = blobUrl;
  } catch (err: any) {
    let message = err.message;
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        message = JSON.parse(text)?.error || text;
      } catch {
        // si no se puede parsear, se usa err.message tal cual
      }
    }
    showWindowError(win, 'Error al generar la factura', message);
  }
}
