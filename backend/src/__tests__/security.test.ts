import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { serverError, ValidationError } from '../utils/errors';
import { parseBody, parseId } from '../utils/validation';
import { isValidWebhookSignature } from '../utils/mpWebhook';
import { z } from 'zod';

function fakeRes() {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  res.getHeader = (name: string) => (name === 'X-Request-Id' ? 'req-test-1' : undefined);
  return res;
}

describe('serverError: no filtra mensajes internos', () => {
  it('un error desconocido devuelve 500 genérico, sin el mensaje original', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = fakeRes();
    serverError(res, new Error('relation "User" does not exist at SELECT * FROM ...'));
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
    expect(JSON.stringify(res.body)).not.toContain('User');
    // el usuario recibe un código para pasarle a soporte
    expect(res.body.requestId).toBe('req-test-1');
  });

  it('ValidationError sí muestra su mensaje (es para el usuario) con 400', () => {
    const res = fakeRes();
    serverError(res, new ValidationError('Stock insuficiente.'));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Stock insuficiente.' });
  });

  it('mapea códigos conocidos de Prisma a respuestas útiles', () => {
    const mk = (code: string) => new Prisma.PrismaClientKnownRequestError('boom con detalles internos', { code, clientVersion: 'x' });
    const dup = fakeRes();
    serverError(dup, mk('P2002'));
    expect(dup.statusCode).toBe(409);
    expect(JSON.stringify(dup.body)).not.toContain('boom');

    const missing = fakeRes();
    serverError(missing, mk('P2025'));
    expect(missing.statusCode).toBe(404);
  });
});

describe('validación de entradas', () => {
  const schema = z.object({ name: z.string().trim().min(1).max(5), n: z.coerce.number().int().positive() });

  it('devuelve los datos limpios si son válidos', () => {
    expect(parseBody(schema, { name: '  ab ', n: '3' })).toEqual({ name: 'ab', n: 3 });
  });

  it('lanza ValidationError (400) con el campo que falló', () => {
    expect(() => parseBody(schema, { name: 'demasiado largo', n: 1 })).toThrow(ValidationError);
    expect(() => parseBody(schema, { name: 'a', n: -1 })).toThrow(/n/);
  });

  it('rechaza tipos inesperados (objetos en vez de strings)', () => {
    expect(() => parseBody(schema, { name: { $ne: 1 }, n: 1 })).toThrow(ValidationError);
  });

  it('parseId acepta enteros positivos y rechaza el resto', () => {
    expect(parseId('42')).toBe(42);
    for (const bad of ['abc', '0', '-3', '1.5', undefined]) {
      expect(() => parseId(bad)).toThrow(ValidationError);
    }
  });
});

describe('firma del webhook de Mercado Pago', () => {
  const secret = 'clave-secreta-de-prueba';
  const sign = (id: string, requestId: string, ts: string) =>
    crypto.createHmac('sha256', secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');

  const build = (v1: string, id = '12345') => ({
    headers: { 'x-signature': `ts=1700000000,v1=${v1}`, 'x-request-id': 'req-1' },
    query: { 'data.id': id },
  });

  it('sin secreto configurado no exige firma', () => {
    expect(isValidWebhookSignature({ headers: {}, query: {} }, undefined)).toBe(true);
  });

  it('acepta una firma correcta', () => {
    expect(isValidWebhookSignature(build(sign('12345', 'req-1', '1700000000')), secret)).toBe(true);
  });

  it('rechaza firma alterada, id distinto o headers ausentes', () => {
    expect(isValidWebhookSignature(build('0'.repeat(64)), secret)).toBe(false);
    expect(isValidWebhookSignature(build(sign('12345', 'req-1', '1700000000'), '99999'), secret)).toBe(false);
    expect(isValidWebhookSignature({ headers: {}, query: { 'data.id': '1' } }, secret)).toBe(false);
  });
});
