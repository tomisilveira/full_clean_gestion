// Serializador CSV mínimo (sin librería externa): recibe filas ya "planas" (un objeto
// por fila, valores primitivos) y las columnas en el orden que se quieran mostrar.
// Antepone BOM UTF-8 para que Excel en Windows abra los acentos/ñ correctamente en vez
// de mostrarlos como caracteres corruptos (problema clásico de CSV UTF-8 sin BOM).
export function toCsv(rows: Record<string, any>[], columns: { key: string; label: string }[]): string {
  const escapeCell = (value: any): string => {
    if (value === null || value === undefined) return '';
    let str = String(value);
    // Mitigación de CSV/Formula Injection: si la celda arranca con un carácter que Excel /
    // Sheets interpreta como inicio de fórmula (=, +, -, @) o tab/CR, se le antepone una
    // comilla simple para forzar que se lea como texto literal. Sin esto, un nombre de
    // cliente/producto cargado por un usuario (ej. "=cmd|'/c calc'!A1") podía ejecutar una
    // fórmula/macro apenas alguien abriera el CSV exportado en Excel.
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
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
