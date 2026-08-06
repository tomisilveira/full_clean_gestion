import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes';
import sucursalRoutes from './routes/sucursales.routes';
import categoryRoutes from './routes/categories.routes';
import productRoutes from './routes/products.routes';
import supplierRoutes from './routes/suppliers.routes';
import customerRoutes from './routes/customers.routes';
import budgetRoutes from './routes/budgets.routes';
import cashRoutes from './routes/cash.routes';
import saleRoutes from './routes/sales.routes';
import ticketRoutes from './routes/tickets.routes';
import arcaRoutes from './routes/arca.routes';
import mpRoutes from './routes/mercadopago.routes';
import reportRoutes from './routes/reports.routes';
import configRoutes from './routes/config.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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
app.use('/api/customers', customerRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/arca', arcaRoutes);
app.use('/api/mercadopago', mpRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/config', configRoutes);

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
