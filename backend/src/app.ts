// Configuración de la aplicación Express (sin abrir el puerto): así los tests pueden
// importar `app` y probar la API completa sin levantar un servidor. El arranque real
// (dotenv, puerto, monitoreo, handlers de proceso) vive en index.ts.
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes';
import publicRoutes from './routes/public.routes';
import sucursalRoutes from './routes/sucursales.routes';
import categoryRoutes from './routes/categories.routes';
import productRoutes from './routes/products.routes';
import supplierRoutes from './routes/suppliers.routes';
import purchaseRoutes from './routes/purchases.routes';
import customerRoutes from './routes/customers.routes';
import budgetRoutes from './routes/budgets.routes';
import manualInvoiceRoutes from './routes/manualInvoices.routes';
import cashRoutes from './routes/cash.routes';
import saleRoutes from './routes/sales.routes';
import ticketRoutes from './routes/tickets.routes';
import arcaRoutes from './routes/arca.routes';
import mpRoutes from './routes/mercadopago.routes';
import reportRoutes from './routes/reports.routes';
import configRoutes from './routes/config.routes';
import exportRoutes from './routes/export.routes';
import clientErrorRoutes from './routes/clientErrors.routes';
import { createRateLimiter } from './middleware/rateLimit';
import { prisma } from './db/prisma';
import { serverError } from './utils/errors';

export const app = express();

// Identificador por request: se devuelve en la cabecera X-Request-Id y en los errores 500
// (ver utils/errors.ts), así un usuario puede pasar ese código a soporte y se encuentra
// su error exacto en los logs.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Request-Id', crypto.randomUUID());
  next();
});

// CORS: normalmente el frontend se sirve desde este mismo proceso (ver más abajo), así
// que no debería hacer falta habilitar orígenes cruzados. Si se define FRONTEND_URL (para
// un frontend deployado aparte) se restringe a esa lista; si no, se permite cualquier
// origen (dev local / demo) pero SIN credentials, ya que la auth va por Bearer token en
// el header (no por cookies), así que un origen abierto acá no habilita CSRF.
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : {}));

// Detrás de un proxy inverso (Render, Nginx, etc.) req.ip sería la IP del proxy para TODOS
// los usuarios: el límite de requests y el de intentos de login se compartirían entre todos
// y un solo usuario podría bloquear al resto. Con "trust proxy" Express toma la IP real del
// cliente de X-Forwarded-For. Por defecto: 1 salto en producción (Render), ninguno en
// desarrollo (donde un cliente podría falsificar el header). Se puede ajustar con TRUST_PROXY
// (número de saltos, o false para desactivarlo).
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv !== undefined && trustProxyEnv !== '') {
  app.set('trust proxy', /^\d+$/.test(trustProxyEnv) ? Number(trustProxyEnv) : trustProxyEnv === 'true' ? 1 : false);
} else if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Cabeceras de seguridad (HSTS, X-Content-Type-Options, X-Frame-Options, etc.) y CSP.
// La CSP parte de los valores por defecto de helmet (default-src 'self', sin scripts
// inline, object-src 'none', frame-ancestors 'self') y solo abre lo que la app usa:
//  - Imágenes por https: (logo de la empresa, configurable con una URL externa). El QR de
//    ARCA ya se genera en el servidor (data: URL), sin servicios de terceros.
// upgrade-insecure-requests solo en producción: en http://localhost rompería las llamadas
// a la API al forzarlas a https.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'style-src': ["'self'", "'unsafe-inline'"],
        'font-src': ["'self'", 'data:'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'connect-src': ["'self'"],
        'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
  })
);

app.use(express.json());

// Límite general de requests por IP a toda la API, además del límite específico de
// intentos de login (loginRateLimit): una capa extra contra scraping/abuso básico sobre
// cualquier endpoint, no solo el login.
app.use('/api', createRateLimiter({
  maxRequests: 300,
  windowMs: 5 * 60 * 1000,
  message: 'Demasiadas solicitudes. Intente nuevamente en unos minutos.',
}));

// Health Check para monitores de uptime (UptimeRobot, Better Stack, el health check de
// Render, etc.). Verifica también la base de datos: antes devolvía OK aunque Postgres
// estuviera caído, así que el monitor no avisaba de la falla más común. 503 si la base no
// responde en 3 s. (Un monitor cada 1-5 minutos queda muy lejos del límite general.)
app.get('/api/health', async (_req, res) => {
  const body = { system: 'Full Clean Gestión API', time: new Date().toISOString() };
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    return res.json({ status: 'OK', db: 'up', ...body });
  } catch (error) {
    console.error('Health check: la base de datos no responde:', error);
    return res.status(503).json({ status: 'DEGRADED', db: 'down', ...body });
  }
});

// Errores de la interfaz reportados por el navegador (ver frontend/src/utils/reportError.ts).
app.use('/api/client-errors', clientErrorRoutes);

// API Routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sucursales', sucursalRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/manual-invoices', manualInvoiceRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/arca', arcaRoutes);
app.use('/api/mercadopago', mpRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/config', configRoutes);
app.use('/api/export', exportRoutes);

// Servir el frontend ya compilado (frontend/dist) desde el mismo proceso, para poder
// deployar backend + frontend como una sola app con una sola URL (ideal para demos:
// un solo servicio, sin CORS entre dominios distintos). En desarrollo local seguimos
// usando el servidor de Vite por separado (npm run dev:frontend), así que esto no
// interfiere: si la carpeta no existe, simplemente no se registra.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  console.log('📦 Sirviendo frontend estático desde', frontendDist);
}

// Una ruta /api/... inexistente devolvía el HTML por defecto de Express ("Cannot GET ...").
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

// Último manejador de errores: express.json() lanza acá cuando el body no es JSON válido
// (antes devolvía una página HTML con la traza), y atrapa cualquier error que se escape de
// una ruta sin try/catch.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la solicitud no es un JSON válido.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
  }
  return serverError(res, err);
});
