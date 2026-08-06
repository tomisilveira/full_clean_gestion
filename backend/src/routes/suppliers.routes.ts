import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, requireSucursal, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/suppliers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      include: {
        _count: { select: { products: true, purchases: true } },
      },
      orderBy: { name: 'asc' },
    });
    return res.json(suppliers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/suppliers
router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req, res) => {
  try {
    const { name, cuit, contact, phone, email, address, ivaCondition, bankDetails } = req.body;
    if (!name) return res.status(400).json({ error: 'La Razón Social del proveedor es obligatoria.' });

    const supplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        cuit: cuit ? cuit.trim() : null,
        contact,
        phone,
        email,
        address,
        ivaCondition: ivaCondition || 'Responsable Inscripto',
        bankDetails,
      },
    });
    return res.status(201).json(supplier);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, cuit, contact, phone, email, address, ivaCondition, bankDetails } = req.body;

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name: name?.trim(),
        cuit: cuit ? cuit.trim() : null,
        contact,
        phone,
        email,
        address,
        ivaCondition,
        bankDetails,
      },
    });
    return res.json(supplier);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/suppliers/:id/purchases (Register purchase -> update stock de la sucursal activa + cuenta corriente)
router.post('/:id/purchases', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const supplierId = parseInt(req.params.id);
    const { invoiceNumber, items, payFromCash } = req.body;
    // items: [{ productId, quantity, costPrice }]
    const sucursalId = req.user!.sucursalId!;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un producto en la compra.' });
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado.' });

    let total = 0;
    const formattedItems = items.map(item => {
      const qty = parseFloat(item.quantity);
      const cost = parseFloat(item.costPrice);
      const subtotal = qty * cost;
      total += subtotal;
      return {
        productId: parseInt(item.productId),
        quantity: qty,
        costPrice: cost,
        subtotal,
      };
    });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Purchase (queda registrada contra la sucursal que recibe la mercadería)
      const purchase = await tx.purchase.create({
        data: {
          supplierId,
          sucursalId,
          invoiceNumber: invoiceNumber ? invoiceNumber.trim() : null,
          total,
          userId: req.user!.id,
          items: {
            create: formattedItems,
          },
        },
        include: { items: true },
      });

      // 2. Increase stock (de la sucursal activa) for each product, and update global cost/sale price
      for (const item of formattedItems) {
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (prod) {
          const stockRow = await tx.productStock.upsert({
            where: { productId_sucursalId: { productId: item.productId, sucursalId } },
            update: {},
            create: { productId: item.productId, sucursalId, currentStock: 0, minStock: 5 },
          });

          const newStock = stockRow.currentStock + item.quantity;
          await tx.productStock.update({
            where: { productId_sucursalId: { productId: item.productId, sucursalId } },
            data: { currentStock: newStock },
          });

          await tx.product.update({
            where: { id: item.productId },
            data: {
              costPrice: item.costPrice,
              salePrice: item.costPrice * (1 + prod.profitMargin / 100),
            },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              sucursalId,
              movementType: 'PURCHASE',
              quantity: item.quantity,
              previousStock: stockRow.currentStock,
              newStock,
              reason: `Ingreso por compra #${purchase.id} (Fact/Remito: ${invoiceNumber || 'S/N'})`,
              userId: req.user!.id,
            },
          });
        }
      }

      // 3. Update Supplier Account Balance
      const newBalance = supplier.balance + total;
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: newBalance },
      });

      await tx.supplierAccountMovement.create({
        data: {
          supplierId,
          type: 'PURCHASE_DEBT',
          amount: total,
          balanceAfter: newBalance,
          notes: `Compra #${purchase.id} - ${invoiceNumber ? 'Factura ' + invoiceNumber : 'Remito'}`,
        },
      });

      // If user selected to pay immediately from current open cash session:
      if (payFromCash) {
        const activeSession = await tx.cashSession.findFirst({
          where: { status: 'OPEN', sucursalId },
        });

        if (activeSession) {
          const afterPaymentBalance = newBalance - total;
          await tx.supplier.update({
            where: { id: supplierId },
            data: { balance: afterPaymentBalance },
          });

          await tx.supplierAccountMovement.create({
            data: {
              supplierId,
              type: 'PAYMENT',
              amount: total,
              balanceAfter: afterPaymentBalance,
              notes: `Pago contado de compra #${purchase.id} registrado desde caja #${activeSession.id}`,
            },
          });

          await tx.cashMovement.create({
            data: {
              sessionId: activeSession.id,
              type: 'SUPPLIER_PAYMENT',
              paymentMethod: 'CASH',
              amount: total,
              notes: `Pago de compra a proveedor ${supplier.name} (#${purchase.id})`,
              userId: req.user!.id,
            },
          });
        }
      }

      return purchase;
    });

    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/suppliers/:id/account
router.get('/:id/account', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado.' });

    const movements = await prisma.supplierAccountMovement.findMany({
      where: { supplierId: id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ supplier, movements });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/suppliers/:id/payments (Register payment to supplier)
router.post('/:id/payments', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req: AuthRequest, res: Response) => {
  try {
    const supplierId = parseInt(req.params.id);
    const { amount, notes, paymentMethod, payFromCash } = req.body;
    if (payFromCash && !req.user?.sucursalId) {
      return res.status(400).json({ error: 'Debe seleccionar una sucursal activa para registrar el pago en caja.' });
    }

    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Ingrese un monto de pago válido.' });
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado.' });

    const result = await prisma.$transaction(async (tx) => {
      const newBalance = supplier.balance - paymentAmount;
      const updatedSupplier = await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: newBalance },
      });

      const movement = await tx.supplierAccountMovement.create({
        data: {
          supplierId,
          type: 'PAYMENT',
          amount: paymentAmount,
          balanceAfter: newBalance,
          notes: notes || `Pago a proveedor (${paymentMethod || 'Efectivo'})`,
        },
      });

      if (payFromCash) {
        const activeSession = await tx.cashSession.findFirst({
          where: { status: 'OPEN', sucursalId: req.user!.sucursalId! },
        });

        if (activeSession) {
          await tx.cashMovement.create({
            data: {
              sessionId: activeSession.id,
              type: 'SUPPLIER_PAYMENT',
              paymentMethod: paymentMethod || 'CASH',
              amount: paymentAmount,
              notes: `Pago a proveedor ${supplier.name}: ${notes || 'Pago a cuenta'}`,
              userId: req.user!.id,
            },
          });
        }
      }

      return { supplier: updatedSupplier, movement };
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
