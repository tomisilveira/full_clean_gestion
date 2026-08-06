import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/customers
router.get('/', authenticateToken, async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        _count: { select: { sales: true, budgets: true } },
      },
      orderBy: { name: 'asc' },
    });
    return res.json(customers);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/customers
router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req, res) => {
  try {
    const { name, cuitDni, ivaCondition, phone, email, address, priceList, creditLimit } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre / Razón Social del cliente es obligatorio.' });

    const customer = await prisma.customer.create({
      data: {
        name: name.trim(),
        cuitDni: cuitDni ? cuitDni.trim() : null,
        ivaCondition: ivaCondition || 'Consumidor Final',
        phone,
        email,
        address,
        priceList: priceList || 'RETAIL',
        creditLimit: parseFloat(creditLimit || 0),
      },
    });
    return res.status(201).json(customer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, cuitDni, ivaCondition, phone, email, address, priceList, creditLimit } = req.body;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: name?.trim(),
        cuitDni: cuitDni ? cuitDni.trim() : null,
        ivaCondition,
        phone,
        email,
        address,
        priceList,
        creditLimit: creditLimit !== undefined ? parseFloat(creditLimit) : undefined,
      },
    });
    return res.json(customer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/customers/:id/account
router.get('/:id/account', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const movements = await prisma.customerAccountMovement.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ customer, movements });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/customers/:id/payments (Register customer debt payment / entrega a cuenta)
router.post('/:id/payments', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req: AuthRequest, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const { amount, paymentMethod, notes, registerInCash } = req.body;
    if (registerInCash && !req.user?.sucursalId) {
      return res.status(400).json({ error: 'Debe seleccionar una sucursal activa para registrar el cobro en caja.' });
    }

    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ error: 'Ingrese un monto de cobro válido.' });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const result = await prisma.$transaction(async (tx) => {
      // Payment reduces customer debt (or increases credit balance)
      const newBalance = customer.balance - paymentAmount;
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { balance: newBalance },
      });

      const movement = await tx.customerAccountMovement.create({
        data: {
          customerId,
          type: 'PAYMENT',
          amount: paymentAmount,
          balanceAfter: newBalance,
          paymentMethod: paymentMethod || 'CASH',
          notes: notes || `Cobro de cta. cte. (${paymentMethod || 'Efectivo'})`,
        },
      });

      // If requested, record payment in the open cash register session
      if (registerInCash) {
        const activeSession = await tx.cashSession.findFirst({
          where: { status: 'OPEN', sucursalId: req.user!.sucursalId! },
        });

        if (activeSession) {
          await tx.cashMovement.create({
            data: {
              sessionId: activeSession.id,
              type: 'CUSTOMER_PAYMENT',
              paymentMethod: paymentMethod || 'CASH',
              amount: paymentAmount,
              notes: `Cobro cta. cte. cliente ${customer.name}: ${notes || 'Entrega a cuenta'}`,
              userId: req.user!.id,
            },
          });
        }
      }

      return { customer: updatedCustomer, movement };
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
