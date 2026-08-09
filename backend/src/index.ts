import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS: normalmente el frontend se sirve desde este mismo proceso (ver más abajo), así
// que no debería hacer falta habilitar orígenes cruzados. Si se define FRONTEND_URL (para
// un frontend deployado aparte) se restringe a esa lista; si no, se permite cualquier
// origen (dev local / demo) pero SIN credentials, ya que la auth va por Bearer token en
// el header (no por cookies), así que un origen abierto acá no habilita CSRF.
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : {}));

// Cabeceras de seguridad (X-Content-Type-Options, X-Frame-Options contra clickjacking,
// Strict-Transport-Security, etc.). Se deja contentSecurityPolicy desactivada: el CSP por
// defecto de helmet es pensado para apps que sirven todo desde el mismo origen con
// políticas estrictas de antemano, y podría romper el bundle de Vite (fonts, QR de AFIP
// embebido como <img> a api.qrserver.com, etc.) sin haberlo probado a fondo primero.
app.use(helmet({ contentSecurityPolicy: false }));

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
