import { Router } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Resuelve el alcance de un reporte: sucursal activa por defecto, o consolidado/otra sucursal para ADMIN.
function resolveScope(req: AuthRequest): { sucursalId?: number } {
  const isAdmin = req.user?.role === 'ADMIN';
  if (isAdmin && req.query.all === 'true') return {};
  if (isAdmin && req.query.sucursalId) return { sucursalId: parseInt(req.query.sucursalId as string) };
  return req.user?.sucursalId ? { sucursalId: req.user.sucursalId } : {};
}

// GET /api/reports/dashboard (?all=true o ?sucursalId= para ADMIN)
router.get('/dashboard', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const scope = resolveScope(req);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Today sales total
    const todaySales = await prisma.sale.aggregate({
      where: {
        createdAt: { gte: todayStart, lte: todayEnd },
        status: 'COMPLETED',
        ...scope,
      },
      _sum: { total: true },
      _count: { id: true },
    });

    // Active open cash session(s)
    const openSessions = await prisma.cashSession.findMany({
      where: { status: 'OPEN', ...scope },
      include: { openedByUser: { select: { name: true } }, sucursal: { select: { id: true, nombre: true } } },
    });

    // Low stock count
    const stocks = await prisma.productStock.findMany({
      where: scope,
      include: { product: { select: { active: true } } },
    });
    const lowStockCount = stocks.filter((s) => s.product.active && s.currentStock <= s.minStock).length;

    // Total Customer Debt Balance (global, los clientes no son por sucursal)
    const customerDebts = await prisma.customer.aggregate({
      _sum: { balance: true },
    });

    return res.json({
      todaySalesTotal: todaySales._sum.total || 0,
      todaySalesCount: todaySales._count.id || 0,
      openSessions,
      openSession: openSessions[0] || null, // compat con el frontend previo (single-sucursal)
      lowStockCount,
      totalCustomerBalance: customerDebts._sum.balance || 0,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/reports/sales (?startDate, ?endDate, ?all=true o ?sucursalId= para ADMIN)
router.get('/sales', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const scope = resolveScope(req);
    const { startDate, endDate } = req.query;

    const where: any = { status: 'COMPLETED', ...scope };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        // Límite superior exclusivo al día siguiente en UTC: evita que el desfasaje de zona horaria
        // del servidor excluya ventas del propio "endDate" (setHours operaría en hora local sobre
        // una fecha parseada en UTC, corriendo el corte varias horas antes de lo esperado).
        const end = new Date(endDate as string);
        end.setUTCDate(end.getUTCDate() + 1);
        where.createdAt.lt = end;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        payments: true,
        items: true,
        sucursal: { select: { id: true, nombre: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalRevenue = 0;
    const paymentMethodsSummary: Record<string, number> = {
      CASH: 0,
      DEBIT: 0,
      CREDIT: 0,
      TRANSFER: 0,
      MERCADO_PAGO: 0,
      CURRENT_ACCOUNT: 0,
    };

    const productSalesMap: Record<string, { name: string; quantity: number; total: number }> = {};
    const sucursalSalesMap: Record<string, { nombre: string; total: number; count: number }> = {};

    for (const sale of sales) {
      totalRevenue += sale.total;
      for (const p of sale.payments) {
        paymentMethodsSummary[p.paymentMethod] = (paymentMethodsSummary[p.paymentMethod] || 0) + p.amount;
      }
      for (const item of sale.items) {
        if (!productSalesMap[item.productCode]) {
          productSalesMap[item.productCode] = { name: item.productName, quantity: 0, total: 0 };
        }
        productSalesMap[item.productCode].quantity += item.quantity;
        productSalesMap[item.productCode].total += item.subtotal;
      }
      const sKey = String(sale.sucursalId);
      if (!sucursalSalesMap[sKey]) {
        sucursalSalesMap[sKey] = { nombre: sale.sucursal.nombre, total: 0, count: 0 };
      }
      sucursalSalesMap[sKey].total += sale.total;
      sucursalSalesMap[sKey].count += 1;
    }

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return res.json({
      totalRevenue,
      salesCount: sales.length,
      paymentMethodsSummary,
      topProducts,
      bySucursal: Object.values(sucursalSalesMap),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/reports/profitability (?all=true o ?sucursalId= para ADMIN)
router.get('/profitability', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const scope = resolveScope(req);

    const stocks = await prisma.productStock.findMany({
      where: scope,
      include: { product: { include: { category: { select: { name: true } } } } },
    });

    // Si es consolidado (sin sucursalId), agrupamos el stock de todas las sucursales por producto.
    const byProduct: Record<number, { product: any; totalStock: number }> = {};
    for (const s of stocks) {
      if (!s.product.active) continue;
      if (!byProduct[s.productId]) byProduct[s.productId] = { product: s.product, totalStock: 0 };
      byProduct[s.productId].totalStock += s.currentStock;
    }

    const itemsProfitability = Object.values(byProduct).map(({ product: p, totalStock }) => {
      const marginAmount = p.salePrice - p.costPrice;
      const marginPercentage = p.costPrice > 0 ? (marginAmount / p.costPrice) * 100 : 0;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category?.name || 'Sin Categoría',
        costPrice: p.costPrice,
        salePrice: p.salePrice,
        marginAmount,
        marginPercentage,
        currentStock: totalStock,
        totalPotentialProfit: marginAmount * totalStock,
      };
    });

    return res.json(itemsProfitability);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/reports/stock-value (?all=true o ?sucursalId= para ADMIN)
router.get('/stock-value', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const scope = resolveScope(req);

    const stocks = await prisma.productStock.findMany({
      where: scope,
      include: { product: true, sucursal: { select: { id: true, nombre: true } } },
    });

    let totalCostValuation = 0;
    let totalSaleValuation = 0;
    const bySucursalMap: Record<string, { nombre: string; costValuation: number; saleValuation: number }> = {};
    const productsCounted = new Set<number>();

    for (const s of stocks) {
      if (!s.product.active || s.currentStock <= 0) continue;
      const cost = s.product.costPrice * s.currentStock;
      const sale = s.product.salePrice * s.currentStock;
      totalCostValuation += cost;
      totalSaleValuation += sale;
      productsCounted.add(s.productId);

      const key = String(s.sucursalId);
      if (!bySucursalMap[key]) bySucursalMap[key] = { nombre: s.sucursal.nombre, costValuation: 0, saleValuation: 0 };
      bySucursalMap[key].costValuation += cost;
      bySucursalMap[key].saleValuation += sale;
    }

    return res.json({
      totalProductsCount: productsCounted.size,
      totalCostValuation,
      totalSaleValuation,
      expectedGrossProfit: totalSaleValuation - totalCostValuation,
      bySucursal: Object.values(bySucursalMap),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/reports/cash-summary (?startDate, ?endDate, ?all=true o ?sucursalId= para ADMIN)
// Reporte de caja diario discriminado por medio de pago, por sucursal y consolidado.
router.get('/cash-summary', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const scope = resolveScope(req);
    const { startDate, endDate } = req.query;

    const sessionWhere: any = { ...scope };
    if (startDate || endDate) {
      sessionWhere.openedAt = {};
      if (startDate) sessionWhere.openedAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        sessionWhere.openedAt.lte = end;
      }
    }

    const sessions = await prisma.cashSession.findMany({
      where: sessionWhere,
      include: { movements: true, sucursal: { select: { id: true, nombre: true } } },
    });

    const paymentMethodsSummary: Record<string, number> = {
      CASH: 0, DEBIT: 0, CREDIT: 0, TRANSFER: 0, MERCADO_PAGO: 0, CURRENT_ACCOUNT: 0,
    };
    const bySucursalMap: Record<string, { nombre: string; totals: Record<string, number> }> = {};

    for (const session of sessions) {
      const key = String(session.sucursalId);
      if (!bySucursalMap[key]) {
        bySucursalMap[key] = { nombre: session.sucursal.nombre, totals: { CASH: 0, DEBIT: 0, CREDIT: 0, TRANSFER: 0, MERCADO_PAGO: 0, CURRENT_ACCOUNT: 0 } };
      }
      for (const m of session.movements) {
        if (m.type === 'SALE') {
          paymentMethodsSummary[m.paymentMethod] = (paymentMethodsSummary[m.paymentMethod] || 0) + m.amount;
          bySucursalMap[key].totals[m.paymentMethod] = (bySucursalMap[key].totals[m.paymentMethod] || 0) + m.amount;
        }
      }
    }

    return res.json({
      paymentMethodsSummary,
      bySucursal: Object.values(bySucursalMap),
      sessionsCount: sessions.length,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
