import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, requireSucursal, AuthRequest } from '../middleware/auth';

const router = Router();

// Helper to calculate expected cash session totals
async function calculateSessionTotals(sessionId: number) {
  const session = await prisma.cashSession.findUnique({
    where: { id: sessionId },
    include: { movements: true, sucursal: { select: { id: true, nombre: true } } },
  });

  if (!session) return null;

  let totalSalesCash = 0;
  let totalSalesDebit = 0;
  let totalSalesCredit = 0;
  let totalSalesTransfer = 0;
  let totalSalesMP = 0;
  let totalSalesAccount = 0;

  let manualIn = 0;
  let expenses = 0;
  let withdrawals = 0;
  let supplierPayments = 0;
  let customerPaymentsCash = 0;

  for (const m of session.movements) {
    if (m.type === 'SALE') {
      if (m.paymentMethod === 'CASH') totalSalesCash += m.amount;
      else if (m.paymentMethod === 'DEBIT') totalSalesDebit += m.amount;
      else if (m.paymentMethod === 'CREDIT') totalSalesCredit += m.amount;
      else if (m.paymentMethod === 'TRANSFER') totalSalesTransfer += m.amount;
      else if (m.paymentMethod === 'MERCADO_PAGO') totalSalesMP += m.amount;
      else if (m.paymentMethod === 'CURRENT_ACCOUNT') totalSalesAccount += m.amount;
    } else if (m.type === 'MANUAL_IN') {
      manualIn += m.amount;
    } else if (m.type === 'EXPENSE') {
      expenses += m.amount;
    } else if (m.type === 'WITHDRAWAL') {
      withdrawals += m.amount;
    } else if (m.type === 'SUPPLIER_PAYMENT') {
      supplierPayments += m.amount;
    } else if (m.type === 'CUSTOMER_PAYMENT') {
      customerPaymentsCash += m.amount;
    }
  }

  // Expected CASH in drawer = initial + sales(CASH) + manualIn + customerPayments(CASH) - expenses - withdrawals - supplierPayments
  const expectedCashInDrawer = session.initialAmount + totalSalesCash + manualIn + customerPaymentsCash - expenses - withdrawals - supplierPayments;

  const totalSalesAllMethods = totalSalesCash + totalSalesDebit + totalSalesCredit + totalSalesTransfer + totalSalesMP + totalSalesAccount;

  return {
    session,
    totals: {
      initialAmount: session.initialAmount,
      totalSalesCash,
      totalSalesDebit,
      totalSalesCredit,
      totalSalesTransfer,
      totalSalesMP,
      totalSalesAccount,
      totalSalesAllMethods,
      manualIn,
      expenses,
      withdrawals,
      supplierPayments,
      customerPaymentsCash,
      expectedCashInDrawer,
    },
  };
}

// GET /api/cash/current (caja de la sucursal activa)
router.get('/current', authenticateToken, requireSucursal, async (req: AuthRequest, res) => {
  try {
    const activeSession = await prisma.cashSession.findFirst({
      where: { status: 'OPEN', sucursalId: req.user!.sucursalId! },
      include: {
        openedByUser: { select: { id: true, name: true, username: true } },
        sucursal: { select: { id: true, nombre: true } },
        movements: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!activeSession) {
      return res.json({ activeSession: null });
    }

    const report = await calculateSessionTotals(activeSession.id);
    return res.json({
      activeSession,
      totals: report?.totals,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/cash/open
router.post('/open', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const { initialAmount, notes } = req.body;
    const sucursalId = req.user!.sucursalId!;

    const existingOpen = await prisma.cashSession.findFirst({
      where: { status: 'OPEN', sucursalId },
    });

    if (existingOpen) {
      return res.status(400).json({ error: 'Ya existe una caja abierta en esta sucursal.' });
    }

    const session = await prisma.cashSession.create({
      data: {
        sucursalId,
        openedByUserId: req.user!.id,
        initialAmount: parseFloat(initialAmount || 0),
        notes,
        status: 'OPEN',
      },
      include: { openedByUser: { select: { name: true } }, sucursal: { select: { nombre: true } } },
    });

    return res.status(201).json(session);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/cash/close
router.post('/close', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const { actualAmount, notes } = req.body;
    const sucursalId = req.user!.sucursalId!;

    const activeSession = await prisma.cashSession.findFirst({
      where: { status: 'OPEN', sucursalId },
    });

    if (!activeSession) {
      return res.status(400).json({ error: 'No hay ninguna caja abierta para cerrar en esta sucursal.' });
    }

    const report = await calculateSessionTotals(activeSession.id);
    const expected = report?.totals.expectedCashInDrawer || 0;
    const actual = parseFloat(actualAmount || 0);
    const difference = actual - expected;

    const closedSession = await prisma.cashSession.update({
      where: { id: activeSession.id },
      data: {
        closedByUserId: req.user!.id,
        closedAt: new Date(),
        expectedAmount: expected,
        actualAmount: actual,
        difference,
        notes: notes ? `${activeSession.notes || ''} | Cierre: ${notes}` : activeSession.notes,
        status: 'CLOSED',
      },
      include: {
        openedByUser: { select: { name: true } },
        closedByUser: { select: { name: true } },
        sucursal: { select: { nombre: true } },
      },
    });

    return res.json({
      session: closedSession,
      summary: report?.totals,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/cash/movement (Manual in, expense, withdrawal) — en la caja abierta de la sucursal activa
router.post('/movement', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const { type, amount, paymentMethod, notes } = req.body;
    // type: MANUAL_IN, EXPENSE, WITHDRAWAL

    const activeSession = await prisma.cashSession.findFirst({
      where: { status: 'OPEN', sucursalId: req.user!.sucursalId! },
    });

    if (!activeSession) {
      return res.status(400).json({ error: 'Debe haber una caja abierta en esta sucursal para registrar movimientos.' });
    }

    const movementAmount = parseFloat(amount);
    if (!movementAmount || movementAmount <= 0) {
      return res.status(400).json({ error: 'Monto no válido.' });
    }

    const movement = await prisma.cashMovement.create({
      data: {
        sessionId: activeSession.id,
        type,
        paymentMethod: paymentMethod || 'CASH',
        amount: movementAmount,
        notes,
        userId: req.user!.id,
      },
    });

    return res.status(201).json(movement);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/cash/history (por sucursal activa; ADMIN puede pedir ?all=true para todas)
router.get('/history', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const consolidado = req.user?.role === 'ADMIN' && req.query.all === 'true';

    const sessions = await prisma.cashSession.findMany({
      where: consolidado ? {} : { sucursalId: req.user!.sucursalId! },
      include: {
        openedByUser: { select: { name: true } },
        closedByUser: { select: { name: true } },
        sucursal: { select: { id: true, nombre: true } },
        _count: { select: { movements: true, sales: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });
    return res.json(sessions);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/cash/session/:id/report
router.get('/session/:id/report', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const report = await calculateSessionTotals(id);
    if (!report) return res.status(404).json({ error: 'Sesión de caja no encontrada.' });
    return res.json(report);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
