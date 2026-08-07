import { Request, Response, NextFunction } from 'express';

// Limitador genérico en memoria, por proceso — misma idea que loginRateLimit.ts pero
// reutilizable para cualquier ruta (ver index.ts para el límite general de /api). No usa
// una librería externa (express-rate-limit) para no sumar una dependencia a un backend de
// un solo proceso; si algún día corre con más de una instancia detrás de un load balancer,
// hay que migrar esto a un store compartido (redis) para que el límite sea efectivo entre
// instancias.
export function createRateLimiter(options: { maxRequests: number; windowMs: number; message: string; keyFn?: (req: Request) => string }) {
  const { maxRequests, windowMs, message, keyFn = (req) => req.ip || 'unknown' } = options;
  const hits = new Map<string, { count: number; windowStart: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits) {
      if (now - record.windowStart > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = keyFn(req);
    const now = Date.now();
    const record = hits.get(key);

    if (!record || now - record.windowStart > windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      return next();
    }

    record.count += 1;
    if (record.count > maxRequests) {
      return res.status(429).json({ error: message });
    }
    next();
  };
}
