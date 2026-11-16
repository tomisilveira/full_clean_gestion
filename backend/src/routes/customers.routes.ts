import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { serverError } from '../utils/errors';
import { z } from 'zod';
import { parseBody, parseId, optionalText } from '../utils/validation';

const router = Router();

// Datos personales de clientes: se limita el largo y el formato de cada campo (antes se
// guardaba cualquier cosa que llegara en el body, incluso objetos o textos enormes).
const customerSchema = z.object({
  name: z.string().trim().min(1, 'El nombre / Razón Social del cliente es obligatorio.').max(150),
  cuitDni: optionalText(20),
  ivaCondition: z.string().trim().min(1).max(50).optional(),
  phone: optionalText(40),
  // El formulario manda '' cuando el campo está vacío.
  email: z.union([z.literal(''), z.string().trim().email('El email no tiene un formato válido.').max(150)]).nullish(),
  address: optionalText(250),
  priceList: z.enum(['RETAIL', 'WHOLESALE']).optional(),
  creditLimit: z.coerce.number().finite().min(0, 'El límite de crédito no puede ser negativo.').nullish(),
});

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
    return serverError(res, error);
  }
});

// POST /api/customers
router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req, res) => {
  try {
    const { name, cuitDni, ivaCondition, phone, email, address, priceList, creditLimit } = parseBody(customerSchema, req.body);

    const customer = await prisma.customer.create({
      data: {
        name,
        cuitDni: cuitDni || null,
        ivaCondition: ivaCondition || 'Consumidor Final',
        phone,
        email,
        address,
        priceList: priceList || 'RETAIL',
        creditLimit: creditLimit ?? 0,
      },
    });
    return res.status(201).json(customer);
  } catch (error: any) {
    return serverError(res, error);
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { name, cuitDni, ivaCondition, phone, email, address, priceList, creditLimit } = parseBody(customerSchema.partial(), req.body);

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name,
        cuitDni: cuitDni || null,
        ivaCondition,
        phone,
        email,
        address,
        priceList,
        creditLimit: creditLimit ?? undefined,
      },
    });
    return res.json(customer);
  } catch (error: any) {
    return serverError(res, error);
  }
});

// GET /api/customers/:id/account — estado de situación completo: saldo cta. cte.,
// movimientos de cuenta y el historial real de compras (no solo la deuda/pago).
router.get('/:id/account', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });

    // Las facturas libres son ADMIN-only en el resto del sistema (ver
    // manualInvoices.routes.ts): un VENDEDOR/SOLO_CONSULTA no debería verlas tampoco acá,
    // así que ni se consultan si quien pide esto no es ADMIN.
    const isAdmin = req.user?.role === 'ADMIN';

    const [movements, sales, manualInvoices] = await Promise.all([
      prisma.customerAccountMovement.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sale.findMany({
        where: { customerId: id },
        include: { sucursal: { select: { id: true, nombre: true } }, items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      isAdmin
        ? prisma.manualInvoice.findMany({
            where: { customerId: id },
            include: { items: true, invoiceARCA: true },
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        : Promise.resolve([]),
    ]);

    const completedSales = sales.filter((s) => s.status === 'COMPLETED');
    const summary = {
      totalPurchased: completedSales.reduce((sum, s) => sum + s.total, 0),
      salesCount: completedSales.length,
      currentBalance: customer.balance,
    };

    return res.json({ customer, movements, sales, manualInvoices, summary });
  } catch (error: any) {
    return serverError(res, error);
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
    return serverError(res, error);
  }
});

export default router;
