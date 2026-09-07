import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, requireSucursal, AuthRequest } from '../middleware/auth';
import { createSale, ValidationError } from '../services/salesService';

const router = Router();

// GET /api/sales (por sucursal activa; ADMIN puede pedir ?all=true o ?sucursalId=)
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, customerId, status, all, sucursalId } = req.query;

    const where: any = {};
    if (status) where.status = status as string;
    if (customerId) where.customerId = parseInt(customerId as string);

    if (req.user?.role === 'ADMIN' && all === 'true') {
      // sin filtro de sucursal: consolidado
    } else if (req.user?.role === 'ADMIN' && sucursalId) {
      where.sucursalId = parseInt(sucursalId as string);
    } else {
      // -1 (nunca matchea un id real) en vez de `undefined`: Prisma ignora una clave en
      // `where` cuyo valor es undefined, tratándola como "sin filtro" — si un no-ADMIN
      // todavía no seleccionó sucursal (sucursalId ausente en el token), esto devolvería
      // el listado completo de todas las sucursales en vez de ninguno.
      where.sucursalId = req.user?.sucursalId ?? -1;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        // Límite superior exclusivo al día siguiente en UTC (ver reports.routes.ts para el detalle del bug que evita).
        const end = new Date(endDate as string);
        end.setUTCDate(end.getUTCDate() + 1);
        where.createdAt.lt = end;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, cuitDni: true } },
        user: { select: { id: true, name: true } },
        sucursal: { select: { id: true, nombre: true } },
        payments: true,
        invoiceARCA: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json(sales);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/sales/:id
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        user: { select: { id: true, name: true, username: true } },
        sucursal: true,
        items: true,
        payments: true,
        invoiceARCA: true,
        session: true,
      },
    });

    if (!sale) return res.status(404).json({ error: 'Venta no encontrada.' });

    // Aislamiento por sucursal: un ADMIN puede ver cualquier venta; el resto solo las
    // de su(s) sucursal(es) asignada(s) (la activa en el token).
    if (req.user?.role !== 'ADMIN' && sale.sucursalId !== req.user?.sucursalId) {
      return res.status(403).json({ error: 'No tiene acceso a esta venta (pertenece a otra sucursal).' });
    }

    return res.json(sale);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/sales (POS Sale Checkout) — usa la caja abierta de la sucursal activa.
// La lógica de negocio vive en services/salesService.ts (createSale), compartida con la
// conversión de presupuestos en budgets.routes.ts.
router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, saleType, items, payments, discountType, discountValue } = req.body;
    // items: [{ productId, quantity }]
    // payments: [{ paymentMethod, amount, reference, cardType, installments }]
    const sale = await createSale({
      sucursalId: req.user!.sucursalId!,
      userId: req.user!.id,
      customerId, saleType, items, payments, discountType, discountValue,
    });
    return res.status(201).json(sale);
  } catch (error: any) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/sales/:id/cancel (Cancel sale and revert stock en la sucursal de la venta)
router.post('/:id/cancel', authenticateToken, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true, payments: true, customer: true },
    });

    if (!sale) return res.status(404).json({ error: 'Venta no encontrada.' });
    if (sale.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Esta venta ya se encuentra anulada.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update sale status
      const updatedSale = await tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // 2. Revert Stock (en la sucursal donde se hizo la venta)
      for (const item of sale.items) {
        const stockRow = await tx.productStock.upsert({
          where: { productId_sucursalId: { productId: item.productId, sucursalId: sale.sucursalId } },
          update: {},
          create: { productId: item.productId, sucursalId: sale.sucursalId, currentStock: 0, minStock: 5 },
        });

        const newStock = stockRow.currentStock + item.quantity;
        await tx.productStock.update({
          where: { productId_sucursalId: { productId: item.productId, sucursalId: sale.sucursalId } },
          data: { currentStock: newStock },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            sucursalId: sale.sucursalId,
            movementType: 'SALE_CANCEL',
            quantity: item.quantity,
            previousStock: stockRow.currentStock,
            newStock,
            reason: `Anulación de Venta #${sale.saleNumber}`,
            userId: req.user!.id,
          },
        });
      }

      // 3. Revert Account balances if current account payment was made
      for (const p of sale.payments) {
        if (p.paymentMethod === 'CURRENT_ACCOUNT' && sale.customerId) {
          const cust = await tx.customer.findUnique({ where: { id: sale.customerId } });
          if (cust) {
            const newBal = cust.balance - p.amount;
            await tx.customer.update({
              where: { id: cust.id },
              data: { balance: newBal },
            });

            await tx.customerAccountMovement.create({
              data: {
                customerId: cust.id,
                saleId: sale.id,
                type: 'PAYMENT',
                amount: p.amount,
                balanceAfter: newBal,
                notes: `Reversión por anulación de venta #${sale.saleNumber}`,
              },
            });
          }
        }
      }

      return updatedSale;
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
