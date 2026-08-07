import { api } from '../services/api';
import { toastError, toastSuccess } from '../store/useToastStore';

// Descarga autenticada de un archivo (CSV/JSON de exportación, etc.): a diferencia de
// openBudgetPdf/openTicketPreview (que abren el archivo para VERLO en una pestaña), esto
// dispara directamente el diálogo de "Guardar archivo" del navegador, que es lo que tiene
// sentido para una exportación de datos.
export async function downloadFile(url: string, suggestedFilename: string) {
  try {
    const res = await api.get(url, { responseType: 'blob' });

    // El nombre real lo define el backend via Content-Disposition; si por algún motivo no
    // viene, se usa el sugerido como respaldo.
    const disposition: string = res.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] || suggestedFilename;

    const blobUrl = URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
    toastSuccess(`Archivo "${filename}" descargado correctamente.`);
  } catch (err: any) {
    // El body de un error con responseType 'blob' viene como Blob, no como JSON.
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        err.response.data = JSON.parse(text);
      } catch {
        // si no se puede parsear, toastError igual cae al mensaje genérico de axios
      }
    }
    toastError(err);
  }
}
