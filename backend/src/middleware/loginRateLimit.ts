import { Request, Response, NextFunction } from 'express';

// Protección anti fuerza-bruta para /api/auth/login: sin esto, cualquiera podía probar
// contraseñas sin límite. Es intencionalmente simple (en memoria, por proceso) para no
// sumar una dependencia nueva (redis, express-rate-limit) a un backend de un solo proceso.
// Si en algún momento se corre con más de una instancia detrás de un load balancer, esto
// deja de ser efectivo por instancia y conviene migrar a un store compartido.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
}

const attemptsByKey = new Map<string, AttemptRecord>();

// Limpieza periódica para no acumular memoria indefinidamente con IPs/usuarios viejos.
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attemptsByKey) {
    if (now - record.firstAttemptAt > WINDOW_MS) attemptsByKey.delete(key);
  }
}, WINDOW_MS).unref();

function keyFor(req: Request): string {
  const username = String(req.body?.username || '').toLowerCase().trim();
  return `${req.ip}:${username}`;
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = keyFor(req);
  const now = Date.now();
  const record = attemptsByKey.get(key);

  if (record && now - record.firstAttemptAt < WINDOW_MS && record.count >= MAX_ATTEMPTS) {
    const minutesLeft = Math.ceil((WINDOW_MS - (now - record.firstAttemptAt)) / 60000);
    return res.status(429).json({
      error: `Demasiados intentos de inicio de sesión fallidos. Intente nuevamente en ${minutesLeft} minuto(s).`,
    });
  }

  next();
}

// Se llama solo cuando el login efectivamente falla (usuario/contraseña incorrectos),
// para no penalizar logins correctos consecutivos de un mismo usuario/IP.
export function registerFailedLogin(req: Request) {
  const key = keyFor(req);
  const now = Date.now();
  const record = attemptsByKey.get(key);

  if (!record || now - record.firstAttemptAt >= WINDOW_MS) {
    attemptsByKey.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

export function clearFailedLogins(req: Request) {
  attemptsByKey.delete(keyFor(req));
}
