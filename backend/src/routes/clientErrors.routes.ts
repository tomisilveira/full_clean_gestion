import { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../middleware/rateLimit';
import { reportError } from '../utils/monitoring';
import { parseBody } from '../utils/validation';
import { serverError } from '../utils/errors';

const router = Router();

// El navegador reporta acá los errores de la interfaz (ErrorBoundary, errores globales y
// promesas rechazadas). Es público a propósito: el error puede ocurrir antes de iniciar
// sesión. Por eso: límite estricto por IP, campos acotados y NADA se guarda en la base; solo
// va al log del servidor (y a Sentry, si está configurado). No se registran IP ni usuario.
router.use(createRateLimiter({
  maxRequests: 20,
  windowMs: 10 * 60 * 1000,
  message: 'Demasiados reportes de error.',
}));

const clientErrorSchema = z.object({
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  componentStack: z.string().max(4000).optional(),
  path: z.string().max(200).optional(),
});

router.post('/', (req, res) => {
  try {
    const { message, stack, componentStack, path } = parseBody(clientErrorSchema, req.body);
    const requestId = String(res.getHeader('X-Request-Id') || '');
    console.error(`[client-error] ${message} (ruta: ${path ?? '?'}) [${requestId}]\n${stack ?? ''}${componentStack ?? ''}`);

    const err = new Error(message);
    err.stack = `${message}\n${stack ?? ''}`;
    reportError(err, { requestId, source: 'frontend' });
    return res.status(204).end();
  } catch (error) {
    return serverError(res, error);
  }
});

export default router;
