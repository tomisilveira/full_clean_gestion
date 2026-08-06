import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, requireSucursal, AuthRequest } from '../middleware/auth';

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
      where.sucursalId = req.user!.sucursalId!;
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
router.get('/:id', authenticateToken, async (req, res) => {
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
    return res.json(sale);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/sales (POS Sale Checkout) — usa la caja abierta de la sucursal activa
router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, saleType, items, payments, discount } = req.body;
    // items: [{ productId, quantity, unitPrice }]
    // payments: [{ paymentMethod, amount, reference }]
    const sucursalId = req.user!.sucursalId!;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito de ventas no puede estar vacío.' });
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ error: 'Debe especificar al menos un medio de pago.' });
    }

    // 1. Verify Active Cash Session for this sucursal
    const activeSession = await prisma.cashSession.findFirst({
      where: { status: 'OPEN', sucursalId },
    });

    if (!activeSession) {
      return res.status(400).json({ error: 'No se puede registrar ventas sin una caja abierta en esta sucursal. Abra la caja primero.' });
    }

    // 2. Validate Items, Prices & Stock (en la sucursal activa)
    let subtotal = 0;
    const formattedItems: {
      productId: number;
      productCode: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: parseInt(item.productId) } });
      if (!product || !product.active) {
        return res.status(400).json({ error: `Producto no válido o inactivo ID ${item.productId}` });
      }

      const qty = parseFloat(item.quantity);
      if (qty <= 0) {
        return res.status(400).json({ error: `Cantidad inválida para producto ${product.name}` });
      }

      const unitPrice = item.unitPrice !== undefined ? parseFloat(item.unitPrice) : (saleType === 'WHOLESALE' ? product.wholesalePrice : product.salePrice);
      const itemSubtotal = qty * unitPrice;
      subtotal += itemSubtotal;

      formattedItems.push({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity: qty,
        unitPrice,
        subtotal: itemSubtotal,
      });
    }

    const discountAmount = parseFloat(discount || 0);
    const total = subtotal - discountAmount;

    // Validate payment sum matches total
    const paymentSum = payments.reduce((acc, p) => acc + parseFloat(p.amount), 0);
    if (Math.abs(paymentSum - total) > 0.05) {
      return res.status(400).json({
        error: `El total de pagos ($${paymentSum.toFixed(2)}) no coincide con el total de la venta ($${total.toFixed(2)}).`,
      });
    }

    // Generate Sale Number
    const count = await prisma.sale.count();
    const saleNumber = `VTA-${(count + 1).toString().padStart(8, '0')}`;

    // Execute Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create Sale
      const sale = await tx.sale.create({
        data: {
          saleNumber,
          sucursalId,
          sessionId: activeSession.id,
          customerId: customerId ? parseInt(customerId) : null,
          saleType: saleType || 'RETAIL',
          subtotal,
          discount: discountAmount,
          total,
          status: 'COMPLETED',
          userId: req.user!.id,
          items: {
            create: formattedItems,
          },
          payments: {
            create: payments.map((p) => ({
              paymentMethod: p.paymentMethod,
              amount: parseFloat(p.amount),
              reference: p.reference || null,
            })),
          },
        },
        include: { items: true, payments: true, customer: true },
      });

      // Update Stock (de la sucursal) for each product
      for (const item of formattedItems) {
        const stockRow = await tx.productStock.upsert({
          where: { productId_sucursalId: { productId: item.productId, sucursalId } },
          update: {},
          create: { productId: item.productId, sucursalId, currentStock: 0, minStock: 5 },
        });

        const newStock = stockRow.currentStock - item.quantity;
        await tx.productStock.update({
          where: { productId_sucursalId: { productId: item.productId, sucursalId } },
          data: { currentStock: newStock },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            sucursalId,
            movementType: 'SALE',
            quantity: item.quantity,
            previousStock: stockRow.currentStock,
            newStock,
            reason: `Venta #${sale.saleNumber}`,
            userId: req.user!.id,
          },
        });
      }

      // Record payments in Cash Register and Customer Account
      for (const p of payments) {
        const pAmount = parseFloat(p.amount);
        const pMethod = p.paymentMethod;

        if (pMethod === 'CURRENT_ACCOUNT') {
          if (!customerId) {
            throw new Error('Para cobrar a Cuenta Corriente debe seleccionar un cliente.');
          }

          const customer = await tx.customer.findUnique({ where: { id: parseInt(customerId) } });
          if (!customer) throw new Error('Cliente no encontrado.');

          const newCustomerBalance = customer.balance + pAmount;
          await tx.customer.update({
            where: { id: customer.id },
            data: { balance: newCustomerBalance },
          });

          await tx.customerAccountMovement.create({
            data: {
              customerId: customer.id,
              saleId: sale.id,
              type: 'CHARGE_DEBT',
              amount: pAmount,
              balanceAfter: newCustomerBalance,
              paymentMethod: 'CURRENT_ACCOUNT',
              notes: `Cargo por venta #${sale.saleNumber}`,
            },
          });
        }

        // Register Cash Movement
        await tx.cashMovement.create({
          data: {
            sessionId: activeSession.id,
            type: 'SALE',
            paymentMethod: pMethod,
            amount: pAmount,
            notes: `Venta #${sale.saleNumber}`,
            userId: req.user!.id,
          },
        });
      }

      return sale;
    });

    return res.status(201).json(result);
  } catch (error: any) {
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
