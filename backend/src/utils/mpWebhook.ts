import crypto from 'crypto';

interface WebhookRequestLike {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body?: any;
}

// Verifica la firma x-signature que Mercado Pago agrega a cada notificación
// (https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks).
// Solo se exige si hay `secret` (MP_WEBHOOK_SECRET, la "clave secreta" de la integración);
// sin ella el webhook sigue funcionando como antes, apoyado únicamente en re-consultar el pago.
export function isValidWebhookSignature(req: WebhookRequestLike, secret: string | undefined): boolean {
  if (!secret) return true;

  const signature = String(req.headers['x-signature'] || '');
  const requestId = String(req.headers['x-request-id'] || '');
  const parts = Object.fromEntries(
    signature.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // El id va en el query string (data.id); si es alfanumérico MP lo firma en minúsculas.
  const rawId = String(req.query['data.id'] ?? req.body?.data?.id ?? '');
  const manifest = `id:${rawId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
