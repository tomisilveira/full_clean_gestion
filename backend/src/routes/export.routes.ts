import { Router } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';
import { toCsv, csvFilename } from '../utils/csv';

const router = Router();

// Exportación de datos: solo ADMIN. Es información sensible (clientes, saldos, ventas,
// y el volcado completo incluye prácticamente toda la operación de la empresa), así que
// se restringe más que la mayoría de las lecturas del sistema (que suelen alcanzar con
// estar autenticado).
router.use(authenticateToken, requireRole(['ADMIN']));

// Formatea fechas como en el resto de la app (es-AR) en vez de dejar el toString() crudo
// de Date de JS (ej. "Fri Aug 07 2026 08:57:07 GMT-0300..."), que es incómodo de leer en Excel.
function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleString('es-AR');
}

function sendCsv(res: any, filenamePrefix: string, rows: Record<string, any>[], columns: { key: string; label: string }[]) {
  const csv = toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csvFilename(filenamePrefix)}"`);
  return res.send(csv);
}

// GET /api/export/customers.csv
router.get('/customers.csv', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
    const rows = customers.map((c) => ({ ...c, createdAt: fmtDate(c.createdAt) }));
    return sendCsv(res, 'clientes', rows, [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Nombre / Razón Social' },
      { key: 'cuitDni', label: 'CUIT/DNI' },
      { key: 'ivaCondition', label: 'Condición IVA' },
      { key: 'phone', label: 'Teléfono' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Dirección' },
      { key: 'priceList', label: 'Lista de Precios' },
      { key: 'creditLimit', label: 'Límite de Crédito' },
      { key: 'balance', label: 'Saldo Cta. Cte.' },
      { key: 'createdAt', label: 'Fecha de Alta' },
    ]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/export/suppliers.csv
router.get('/suppliers.csv', async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
    const rows = suppliers.map((s) => ({ ...s, createdAt: fmtDate(s.createdAt) }));
    return sendCsv(res, 'proveedores', rows, [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Razón Social' },
      { key: 'cuit', label: 'CUIT' },
      { key: 'contact', label: 'Contacto' },
      { key: 'phone', label: 'Teléfono' },
      { key: 'email', label: 'Email' },
      { key: 'address', label: 'Dirección' },
      { key: 'ivaCondition', label: 'Condición IVA' },
      { key: 'balance', label: 'Saldo Deuda' },
      { key: 'createdAt', label: 'Fecha de Alta' },
    ]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/export/products.csv
router.get('/products.csv', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { category: true, supplier: true, stocks: { include: { sucursal: true } } },
      orderBy: { name: 'asc' },
    });
    const rows = products.map((p) => ({
      ...p,
      categoryName: p.category?.name || '',
      supplierName: p.supplier?.name || '',
      totalStock: p.stocks.reduce((sum, s) => sum + s.currentStock, 0),
      stockPorSucursal: p.stocks.map((s) => `${s.sucursal.nombre}: ${s.currentStock}`).join(' | '),
    }));
    return sendCsv(res, 'productos', rows, [
      { key: 'id', label: 'ID' },
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Nombre' },
      { key: 'categoryName', label: 'Categoría' },
      { key: 'unit', label: 'Unidad' },
      { key: 'costPrice', label: 'Precio Costo' },
      { key: 'profitMargin', label: 'Margen %' },
      { key: 'salePrice', label: 'Precio Venta' },
      { key: 'wholesalePrice', label: 'Precio Mayorista' },
      { key: 'supplierName', label: 'Proveedor' },
      { key: 'totalStock', label: 'Stock Total (todas las sucursales)' },
      { key: 'stockPorSucursal', label: 'Stock por Sucursal' },
      { key: 'active', label: 'Activo' },
    ]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/export/sales.csv (?startDate, ?endDate)
router.get('/sales.csv', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setUTCDate(end.getUTCDate() + 1);
        where.createdAt.lt = end;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { customer: true, sucursal: true, user: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
    const rows = sales.map((s) => ({
      ...s,
      createdAt: fmtDate(s.createdAt),
      customerName: s.customer?.name || 'Consumidor Final',
      sucursalName: s.sucursal.nombre,
      userName: s.user.name,
      paymentMethods: s.payments.map((p) => `${p.paymentMethod}${p.cardType ? ` (${p.cardType}${p.installments ? `, ${p.installments}c` : ''})` : ''}: $${p.amount.toFixed(2)}`).join(' | '),
    }));
    return sendCsv(res, 'ventas', rows, [
      { key: 'id', label: 'ID' },
      { key: 'saleNumber', label: 'Nº Venta' },
      { key: 'createdAt', label: 'Fecha' },
      { key: 'sucursalName', label: 'Sucursal' },
      { key: 'customerName', label: 'Cliente' },
      { key: 'userName', label: 'Vendedor' },
      { key: 'saleType', label: 'Tipo de Venta' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'discountType', label: 'Tipo Descuento' },
      { key: 'discountValue', label: 'Valor Descuento' },
      { key: 'discount', label: 'Descuento ($)' },
      { key: 'total', label: 'Total' },
      { key: 'paymentMethods', label: 'Medios de Pago' },
      { key: 'status', label: 'Estado' },
    ]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/export/purchases.csv (?startDate, ?endDate)
router.get('/purchases.csv', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setUTCDate(end.getUTCDate() + 1);
        where.createdAt.lt = end;
      }
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include: { supplier: true, sucursal: true, user: true },
      orderBy: { createdAt: 'desc' },
    });
    const rows = purchases.map((p) => ({
      ...p,
      createdAt: fmtDate(p.createdAt),
      supplierName: p.supplier.name,
      sucursalName: p.sucursal.nombre,
      userName: p.user.name,
    }));
    return sendCsv(res, 'compras', rows, [
      { key: 'id', label: 'ID' },
      { key: 'createdAt', label: 'Fecha' },
      { key: 'sucursalName', label: 'Sucursal' },
      { key: 'supplierName', label: 'Proveedor' },
      { key: 'invoiceNumber', label: 'Fact./Remito' },
      { key: 'userName', label: 'Registrada por' },
      { key: 'total', label: 'Total' },
      { key: 'status', label: 'Estado' },
    ]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/export/full — volcado completo de todas las tablas en JSON. No es un dump SQL
// crudo (pg_dump no está garantizado disponible en el runtime de Render) sino un export a
// nivel de aplicación: cubre exactamente los mismos datos, en un formato legible y portable
// a cualquier destino (no depende de tener Postgres del otro lado para reimportarlo).
router.get('/full', async (req, res) => {
  try {
    const [
      companyConfig, sucursales, categories, products, suppliers, purchases,
      customers, customerAccountMovements, supplierAccountMovements,
      budgets, cashSessions, sales, manualInvoices, invoicesARCA, users,
    ] = await Promise.all([
      prisma.companyConfig.findMany(),
      prisma.sucursal.findMany(),
      prisma.category.findMany(),
      prisma.product.findMany({ include: { stocks: true } }),
      prisma.supplier.findMany(),
      prisma.purchase.findMany({ include: { items: true } }),
      prisma.customer.findMany(),
      prisma.customerAccountMovement.findMany(),
      prisma.supplierAccountMovement.findMany(),
      prisma.budget.findMany({ include: { items: true } }),
      prisma.cashSession.findMany({ include: { movements: true } }),
      prisma.sale.findMany({ include: { items: true, payments: true } }),
      prisma.manualInvoice.findMany({ include: { items: true } }),
      prisma.invoiceARCA.findMany(),
      // Nunca se incluye passwordHash en un export, aunque sea solo para ADMIN: si el
      // archivo se comparte o se pierde, no debe filtrar hashes de contraseñas.
      prisma.user.findMany({ select: { id: true, username: true, name: true, role: true, active: true, createdAt: true } }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      companyConfig, sucursales, categories, products, suppliers, purchases,
      customers, customerAccountMovements, supplierAccountMovements,
      budgets, cashSessions, sales, manualInvoices, invoicesARCA, users,
    };

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="full_clean_backup_${stamp}.json"`);
    // JSON.stringify con BigInt (cbteDesde/cbteHasta de InvoiceARCA) rompe por defecto:
    // se serializa a string.
    return res.send(JSON.stringify(payload, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
