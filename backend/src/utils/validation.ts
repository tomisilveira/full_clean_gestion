import { z } from 'zod';
import { ValidationError } from './errors';

// Mensajes de validación por defecto en español (el mensaje llega tal cual al usuario).
z.config(z.locales.es());

// Valida `data` (típicamente req.body) contra un schema de zod. Si falla, lanza
// ValidationError con un mensaje legible en español (serverError lo devuelve como 400).
export function parseBody<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ValidationError(`Datos inválidos — ${field}${issue.message}`);
  }
  return result.data;
}

// Texto opcional: acepta string, null o ausente; recorta espacios y limita el largo.
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `no puede superar los ${max} caracteres`)
    .nullish();

// ID numérico de un parámetro de ruta (:id). Evita NaN llegando a Prisma.
export function parseId(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('Identificador inválido.');
  return n;
}
