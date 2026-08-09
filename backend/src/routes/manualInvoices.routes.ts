import { Router, Response } from 'express';
import PDFDocument from 'pdfkit';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, requireSucursal, AuthRequest } from '../middleware/auth';

const router = Router();

// Facturación libre: comprobantes ARCA reales para operaciones que no pasan por el
// catálogo de productos ni tocan stock/caja (algo que la empresa factura por fuera de
// este sistema). Es intencionalmente independiente de Sale/Budget — no permite asociarse
// a ningún registro existente, justamente para que no pueda usarse para "redescribir" una
// venta real que sí está cargada acá. Restringido a ADMIN por lo sensible que es emitir
// comprobantes de texto libre.
router.use(authenticateToken, requireRole(['ADMIN']), requireSucursal);

// GET /api/manual-invoices
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const invoices = await prisma.manualInvoice.findMany({
      include: {
        customer: { select: { id: true, name: true, cuitDni: true } },
        sucursal: { select: { id: true, nombre: true } },
        user: { select: { id: true, name: true } },
        items: true,
        invoiceARCA: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(invoices);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/manual-invoices/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const invoice = await prisma.manualInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        sucursal: true,
        user: { select: { id: true, name: true } },
        items: true,
        invoiceARCA: true,
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada.' });
    return res.json(invoice);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/manual-invoices
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { customerId, customerName, items, notes } = req.body;
    // items: [{ description, quantity, unitPrice }]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un ítem en la factura.' });
    }

    let resolvedCustomerName = (customerName || '').trim();
    if (customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: parseInt(customerId) } });
      if (customer) resolvedCustomerName = customer.name;
    }
    if (!resolvedCustomerName) {
      return res.status(400).json({ error: 'Debe indicar el cliente.' });
    }

    let subtotal = 0;
    const formattedItems = [];
    for (const item of items) {
      const description = (item.description || '').trim();
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);

      if (!description) return res.status(400).json({ error: 'Cada ítem necesita una descripción.' });
      if (isNaN(quantity) || quantity <= 0) return res.status(400).json({ error: `Cantidad inválida para "${description}".` });
      if (isNaN(unitPrice) || unitPrice < 0) return res.status(400).json({ error: `Precio inválido para "${description}".` });

      const itemSubtotal = Math.round(quantity * unitPrice * 100) / 100;
      subtotal += itemSubtotal;
      formattedItems.push({ description, quantity, unitPrice, subtotal: itemSubtotal });
    }

    const invoice = await prisma.manualInvoice.create({
      data: {
        customerId: customerId ? parseInt(customerId) : null,
        customerName: resolvedCustomerName,
        sucursalId: req.user!.sucursalId!,
        subtotal,
        total: subtotal,
        notes: notes || null,
        userId: req.user!.id,
        items: { create: formattedItems },
      },
      include: { items: true },
    });

    return res.status(201).json(invoice);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/manual-invoices/:id/pdf
router.get('/:id/pdf', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const invoice = await prisma.manualInvoice.findUnique({
      where: { id },
      include: { customer: true, items: true, invoiceARCA: true, sucursal: true },
    });
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada.' });

    const company = await prisma.companyConfig.findFirst() || {
      businessName: 'Artículos de Limpieza Full Clean',
      cuit: '20-40000000-9',
      address: 'Av. Principal 1234, Buenos Aires',
      phone: '011 4444-5555',
      email: 'contacto@fullclean.com.ar',
    };

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Factura-${invoice.id}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).text(company.businessName, { align: 'left' });
    doc.fontSize(10).text(`CUIT: ${company.cuit}`);
    doc.text(`Dirección: ${company.address}`);
    doc.text(`Teléfono: ${company.phone} | Email: ${company.email}`);
    doc.moveDown();

    const cbteLabel = invoice.invoiceARCA
      ? (invoice.invoiceARCA.cbteTipo === 1 ? 'FACTURA A' : invoice.invoiceARCA.cbteTipo === 11 ? 'FACTURA C' : 'FACTURA B')
      : 'COMPROBANTE (SIN EMITIR)';
    doc.fontSize(16).text(cbteLabel, { align: 'right' });
    if (invoice.invoiceARCA) {
      doc.fontSize(10).text(
        `${invoice.invoiceARCA.ptoVta.toString().padStart(4, '0')}-${invoice.invoiceARCA.cbteDesde.toString().padStart(8, '0')}`,
        { align: 'right' }
      );
    }
    doc.text(`Fecha: ${new Date(invoice.createdAt).toLocaleDateString('es-AR')}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(12).text(`Cliente: ${invoice.customerName}`);
    if (invoice.customer?.cuitDni) doc.text(`CUIT/DNI: ${invoice.customer.cuitDni}`);
    if (invoice.customer?.address) doc.text(`Dirección: ${invoice.customer.address}`);
    doc.moveDown();

    const startY = doc.y;
    doc.fontSize(10).text('Descripción', 40, startY, { width: 300 });
    doc.text('Cant.', 340, startY, { width: 50, align: 'right' });
    doc.text('P. Unitario', 400, startY, { width: 80, align: 'right' });
    doc.text('Subtotal', 490, startY, { width: 70, align: 'right' });
    doc.moveTo(40, startY + 15).lineTo(560, startY + 15).stroke();

    let y = startY + 25;
    for (const item of invoice.items) {
      doc.text(item.description, 40, y, { width: 300 });
      doc.text(item.quantity.toString(), 340, y, { width: 50, align: 'right' });
      doc.text(`$${item.unitPrice.toFixed(2)}`, 400, y, { width: 80, align: 'right' });
      doc.text(`$${item.subtotal.toFixed(2)}`, 490, y, { width: 70, align: 'right' });
      y += 20;
    }

    doc.moveTo(40, y).lineTo(560, y).stroke();
    y += 10;
    doc.fontSize(14).text(`TOTAL: $${invoice.total.toFixed(2)}`, 350, y, { width: 210, align: 'right' });
    y += 30;

    if (invoice.invoiceARCA) {
      doc.fontSize(9).text(`CAE: ${invoice.invoiceARCA.cae}`, 40, y);
      doc.text(`Vencimiento CAE: ${invoice.invoiceARCA.caeVto}`, 40, y + 12);
    } else {
      doc.fontSize(9).fillColor('red').text('Este comprobante todavía no tiene CAE emitido por ARCA.', 40, y).fillColor('black');
    }

    doc.end();
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
