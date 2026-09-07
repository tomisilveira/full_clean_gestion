import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/purchases (historial; por sucursal activa, ADMIN puede pedir ?all=true o ?sucursalId=)
// Mismo criterio de aislamiento por sucursal que /api/sales.
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { supplierId, status, all, sucursalId } = req.query;

    const where: any = {};
    if (status) where.status = status as string;
    if (supplierId) where.supplierId = parseInt(supplierId as string);

    if (req.user?.role === 'ADMIN' && all === 'true') {
      // sin filtro de sucursal: consolidado
    } else if (req.user?.role === 'ADMIN' && sucursalId) {
      where.sucursalId = parseInt(sucursalId as string);
    } else {
      // Ver nota equivalente en sales.routes.ts: -1 en vez de `undefined` para no
      // devolver el consolidado de todas las sucursales si todavía no se seleccionó una.
      where.sucursalId = req.user?.sucursalId ?? -1;
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, cuit: true } },
        sucursal: { select: { id: true, nombre: true } },
        user: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json(purchases);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/purchases/:id
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        sucursal: true,
        user: { select: { id: true, name: true } },
        items: { include: { product: true } },
      },
    });

    if (!purchase) return res.status(404).json({ error: 'Compra no encontrada.' });

    if (req.user?.role !== 'ADMIN' && purchase.sucursalId !== req.user?.sucursalId) {
      return res.status(403).json({ error: 'No tiene acceso a esta compra (pertenece a otra sucursal).' });
    }

    return res.json(purchase);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/purchases/:id/cancel (Anular compra: revierte stock y la deuda generada al proveedor)
router.post('/:id/cancel', authenticateToken, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: { items: true, supplier: true },
    });

    if (!purchase) return res.status(404).json({ error: 'Compra no encontrada.' });
    if (purchase.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Esta compra ya se encuentra anulada.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // Revertir stock (en la sucursal que había recibido la mercadería)
      for (const item of purchase.items) {
        const stockRow = await tx.productStock.upsert({
          where: { productId_sucursalId: { productId: item.productId, sucursalId: purchase.sucursalId } },
          update: {},
          create: { productId: item.productId, sucursalId: purchase.sucursalId, currentStock: 0, minStock: 5 },
        });

        const newStock = stockRow.currentStock - item.quantity;
        await tx.productStock.update({
          where: { productId_sucursalId: { productId: item.productId, sucursalId: purchase.sucursalId } },
          data: { currentStock: newStock },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            sucursalId: purchase.sucursalId,
            movementType: 'MANUAL_OUT',
            quantity: item.quantity,
            previousStock: stockRow.currentStock,
            newStock,
            reason: `Anulación de Compra #${purchase.id} (Fact/Remito: ${purchase.invoiceNumber || 'S/N'})`,
            userId: req.user!.id,
          },
        });
      }

      // Revertir la deuda que había generado la compra contra el proveedor. Si ya se
      // había pagado (al contado o después), el saldo puede quedar en contra del
      // proveedor (nos debe el reintegro) — igual que anular una venta a cta. cte. ya cobrada.
      const newBalance = purchase.supplier.balance - purchase.total;
      await tx.supplier.update({
        where: { id: purchase.supplierId },
        data: { balance: newBalance },
      });

      await tx.supplierAccountMovement.create({
        data: {
          supplierId: purchase.supplierId,
          type: 'PAYMENT',
          amount: purchase.total,
          balanceAfter: newBalance,
          notes: `Reversión por anulación de compra #${purchase.id}`,
        },
      });

      return updatedPurchase;
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
