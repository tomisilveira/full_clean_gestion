import { Router, Response } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/budgets
router.get('/', authenticateToken, async (req, res) => {
  try {
    const budgets = await prisma.budget.findMany({
      include: {
        customer: { select: { id: true, name: true, cuitDni: true, phone: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(budgets);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/budgets/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
    if (!budget) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
    return res.json(budget);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/budgets
router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, customerName, items, validDays } = req.body;
    // items: [{ productId, quantity, unitPrice }]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un producto en el presupuesto.' });
    }

    let resolvedCustomerName = customerName || 'Consumidor Final';
    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: parseInt(customerId) } });
      if (customer) resolvedCustomerName = customer.name;
    }

    const count = await prisma.budget.count();
    const budgetNumber = `PRES-${(count + 1).toString().padStart(6, '0')}`;

    const days = parseInt(validDays || 15);
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + days);

    let total = 0;
    const formattedItems = [];

    for (const item of items) {
      const prod = await prisma.product.findUnique({ where: { id: parseInt(item.productId) } });
      if (!prod) continue;

      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unitPrice || prod.salePrice);
      const subtotal = qty * price;
      total += subtotal;

      formattedItems.push({
        productId: prod.id,
        productCode: prod.code,
        productName: prod.name,
        quantity: qty,
        unitPrice: price,
        subtotal,
      });
    }

    const budget = await prisma.budget.create({
      data: {
        budgetNumber,
        customerId: customerId ? parseInt(customerId) : null,
        customerName: resolvedCustomerName,
        sucursalId: req.user?.sucursalId || null,
        total,
        status: 'DRAFT',
        validUntil,
        items: { create: formattedItems },
      },
      include: { items: true },
    });

    return res.status(201).json(budget);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/budgets/:id/convert (Convert budget directly to sale items for POS)
router.post('/:id/convert', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!budget) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
    if (budget.status === 'CONVERTED') {
      return res.status(400).json({ error: 'Este presupuesto ya fue convertido en venta.' });
    }

    await prisma.budget.update({
      where: { id },
      data: { status: 'CONVERTED' },
    });

    return res.json({
      message: 'Presupuesto convertido correctamente.',
      budget,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/budgets/:id/pdf
router.get('/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { customer: true, items: true },
    });

    if (!budget) return res.status(404).json({ error: 'Presupuesto no encontrado.' });

    const company = await prisma.companyConfig.findFirst() || {
      businessName: 'Artículos de Limpieza Full Clean',
      cuit: '20-40000000-9',
      address: 'Av. Principal 1234, Buenos Aires',
      phone: '011 4444-5555',
      email: 'contacto@fullclean.com.ar',
    };

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${budget.budgetNumber}.pdf`);

    doc.pipe(res);

    // Header
    doc.fontSize(20).text(company.businessName, { align: 'left' });
    doc.fontSize(10).text(`CUIT: ${company.cuit}`);
    doc.text(`Dirección: ${company.address}`);
    doc.text(`Teléfono: ${company.phone} | Email: ${company.email}`);
    doc.moveDown();

    doc.fontSize(16).text(`PRESUPUESTO ${budget.budgetNumber}`, { align: 'right' });
    doc.fontSize(10).text(`Fecha: ${new Date(budget.createdAt).toLocaleDateString('es-AR')}`, { align: 'right' });
    doc.text(`Válido hasta: ${new Date(budget.validUntil).toLocaleDateString('es-AR')}`, { align: 'right' });
    doc.moveDown();

    // Customer
    doc.fontSize(12).text(`Cliente: ${budget.customerName}`);
    if (budget.customer?.cuitDni) doc.text(`CUIT/DNI: ${budget.customer.cuitDni}`);
    if (budget.customer?.address) doc.text(`Dirección: ${budget.customer.address}`);
    doc.moveDown();

    // Items table header
    const startY = doc.y;
    doc.fontSize(10).text('Código', 40, startY, { width: 80 });
    doc.text('Producto', 120, startY, { width: 220 });
    doc.text('Cant.', 340, startY, { width: 50, align: 'right' });
    doc.text('P. Unitario', 400, startY, { width: 80, align: 'right' });
    doc.text('Subtotal', 490, startY, { width: 70, align: 'right' });

    doc.moveTo(40, startY + 15).lineTo(560, startY + 15).stroke();

    let y = startY + 25;
    for (const item of budget.items) {
      doc.text(item.productCode, 40, y, { width: 80 });
      doc.text(item.productName, 120, y, { width: 220 });
      doc.text(item.quantity.toString(), 340, y, { width: 50, align: 'right' });
      doc.text(`$${item.unitPrice.toFixed(2)}`, 400, y, { width: 80, align: 'right' });
      doc.text(`$${item.subtotal.toFixed(2)}`, 490, y, { width: 70, align: 'right' });
      y += 20;
    }

    doc.moveTo(40, y).lineTo(560, y).stroke();
    y += 10;

    doc.fontSize(14).text(`TOTAL: $${budget.total.toFixed(2)}`, 350, y, { width: 210, align: 'right' });

    doc.moveDown(3);
    doc.fontSize(9).text('Este presupuesto es de carácter informativo y está sujeto a disponibilidad de stock.', { align: 'center' });

    doc.end();
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
