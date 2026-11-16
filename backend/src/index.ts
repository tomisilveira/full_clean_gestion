// Debe ser el primer import: carga backend/.env antes de que otros módulos (ej.
// middleware/auth.ts, que exige JWT_SECRET al cargarse) lean process.env.
import 'dotenv/config';
import express from 'express';
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
import { createRateLimiter } from './middleware/rateLimit';

const app = express();
const PORT = process.env.PORT || 4000;

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

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', system: 'Full Clean Gestión API', time: new Date().toISOString() });
});

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

app.listen(PORT, () => {
  console.log(`🚀 Servidor backend Full Clean corriendo en http://localhost:${PORT}`);
});
