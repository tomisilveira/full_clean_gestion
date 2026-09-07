import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { emitArcaVoucher, getAfipClient } from '../services/arcaService';

const router = Router();

// POST /api/arca/invoice/manual/:manualInvoiceId (Emit electronic invoice for a factura libre)
// Registrada ANTES de /invoice/:saleId para que Express no intente interpretar "manual"
// como un saleId numérico.
router.post('/invoice/manual/:manualInvoiceId', authenticateToken, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const manualInvoiceId = parseInt(req.params.manualInvoiceId);
    const { cbteTipoOverride } = req.body;

    const invoice = await prisma.manualInvoice.findUnique({
      where: { id: manualInvoiceId },
      include: { customer: true, invoiceARCA: true, sucursal: true },
    });

    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada.' });
    if (invoice.invoiceARCA) {
      return res.status(400).json({ error: 'Esta factura ya tiene un comprobante ARCA/AFIP emitido.', invoice: invoice.invoiceARCA });
    }

    const config = await prisma.companyConfig.findFirst() || {
      cuit: '20-40000000-9',
      ivaCondition: 'Responsable Inscripto',
      arcaHomo: true,
    };
    const ptoVta = invoice.sucursal.ptoVtaArca || 1;

    let emitted;
    try {
      emitted = await emitArcaVoucher({
        total: invoice.total,
        ptoVta,
        config,
        customerCuitDni: invoice.customer?.cuitDni,
        customerIvaCondition: invoice.customer?.ivaCondition,
        cbteTipoOverride,
      });
    } catch (afipErr: any) {
      console.error('Error al comunicar con webservice AFIP/ARCA:', afipErr);
      return res.status(500).json({
        error: 'Error de comunicación con el webservice de ARCA (AFIP).',
        details: afipErr.message || afipErr,
      });
    }

    const created = await prisma.invoiceARCA.create({ data: { manualInvoiceId, ...emitted } });
    return res.status(201).json(created);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/arca/invoice/:saleId (Emit electronic invoice for a sale)
router.post('/invoice/:saleId', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req: AuthRequest, res: Response) => {
  try {
    const saleId = parseInt(req.params.saleId);
    const { cbteTipoOverride } = req.body; // 1: Factura A, 6: Factura B, 11: Factura C

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        items: true,
        invoiceARCA: true,
        sucursal: true,
      },
    });

    if (!sale) return res.status(404).json({ error: 'Venta no encontrada.' });

    // Aislamiento por sucursal: emitir un comprobante fiscal real (con CAE) es una acción
    // irreversible, así que un VENDEDOR no debe poder emitirla para una venta de otra
    // sucursal a la que no tiene acceso (mismo criterio que GET /api/sales/:id).
    if (req.user?.role !== 'ADMIN' && sale.sucursalId !== req.user?.sucursalId) {
      return res.status(403).json({ error: 'No tiene acceso a esta venta (pertenece a otra sucursal).' });
    }

    if (sale.invoiceARCA) {
      return res.status(400).json({ error: 'Esta venta ya tiene un comprobante ARCA/AFIP emitido.', invoice: sale.invoiceARCA });
    }

    const config = await prisma.companyConfig.findFirst() || {
      cuit: '20-40000000-9',
      ivaCondition: 'Responsable Inscripto',
      arcaHomo: true,
    };

    // El punto de venta ARCA es el de la sucursal donde se generó la venta, no uno global.
    const ptoVta = sale.sucursal.ptoVtaArca || 1;

    let emitted;
    try {
      emitted = await emitArcaVoucher({
        total: sale.total,
        ptoVta,
        config,
        customerCuitDni: sale.customer?.cuitDni,
        customerIvaCondition: sale.customer?.ivaCondition,
        cbteTipoOverride,
      });
    } catch (afipErr: any) {
      console.error('Error al comunicar con webservice AFIP/ARCA:', afipErr);
      return res.status(500).json({
        error: 'Error de comunicación con el webservice de ARCA (AFIP).',
        details: afipErr.message || afipErr,
      });
    }

    const invoice = await prisma.invoiceARCA.create({ data: { saleId, ...emitted } });
    return res.status(201).json(invoice);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/arca/last-voucher (Query last authorized voucher number)
router.get('/last-voucher', authenticateToken, async (req, res) => {
  try {
    const { ptoVta, cbteTipo } = req.query;
    const config = await prisma.companyConfig.findFirst();

    const { afip, hasCerts } = getAfipClient(config || {});
    if (afip && hasCerts) {
      const last = await afip.ElectronicBilling.getLastVoucher(
        parseInt((ptoVta as string) || '1'),
        parseInt((cbteTipo as string) || '6')
      );
      return res.json({ ptoVta, cbteTipo, lastVoucher: last });
    } else {
      const count = await prisma.invoiceARCA.count();
      return res.json({ ptoVta, cbteTipo, lastVoucher: count, mock: true });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
