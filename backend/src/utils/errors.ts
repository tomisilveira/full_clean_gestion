import { Response } from 'express';
import { Prisma } from '@prisma/client';

// Error "esperado" de negocio/validación: su mensaje está escrito para el usuario final y es
// seguro mostrarlo tal cual (ej. "Stock insuficiente..."). Cualquier otro error (Prisma,
// TypeError, fallo de red, etc.) es interno y NO debe llegar al cliente: puede incluir
// nombres de tablas/columnas, fragmentos de consulta o valores ingresados por otros usuarios.
export class ValidationError extends Error {}

// Respuesta única para errores inesperados en los handlers. Reemplaza al viejo patrón
// `res.status(500).json({ error: error.message })`, que filtraba mensajes internos.
export function serverError(res: Response, error: unknown) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.message });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Los códigos más comunes tienen una causa de negocio clara y un mensaje útil.
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un registro con ese valor (dato duplicado).' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'El registro solicitado no existe.' });
    }
    if (error.code === 'P2003') {
      return res.status(409).json({ error: 'No se puede completar la operación: el registro está relacionado con otros datos.' });
    }
  }

  // Detalle completo solo en el log del servidor (no incluye el body del request).
  console.error('Error no controlado:', error);
  return res.status(500).json({ error: 'Error interno del servidor. Intente nuevamente.' });
}
