// Serializador CSV mínimo (sin librería externa): recibe filas ya "planas" (un objeto
// por fila, valores primitivos) y las columnas en el orden que se quieran mostrar.
// Antepone BOM UTF-8 para que Excel en Windows abra los acentos/ñ correctamente en vez
// de mostrarlos como caracteres corruptos (problema clásico de CSV UTF-8 sin BOM).
export function toCsv(rows: Record<string, any>[], columns: { key: string; label: string }[]): string {
  const escapeCell = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(','));
  return '﻿' + [header, ...lines].join('\r\n');
}

export function csvFilename(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix}_${stamp}.csv`;
}
