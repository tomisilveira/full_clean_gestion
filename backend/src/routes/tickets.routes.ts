import { Router, Response } from 'express';
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { prisma } from '../db/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Escapa texto para incrustar de forma segura dentro de HTML. Los tickets vuelcan
// datos que carga el usuario (nombre de producto, nombre/CUIT de cliente, razón social
// de la empresa, etc.) directamente en el documento que se abre en una ventana nueva
// (ver frontend/src/utils/tickets.ts) — sin escapar, un nombre de producto o cliente
// con HTML/JS quedaba ejecutando en esa ventana (mismo origen que la app, mismo
// localStorage) apenas alguien imprimía o veía el ticket. Nunca interpolar strings
// de datos del usuario en este archivo sin pasarlos por acá primero.
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Para atributos como src=""/href="": además de escapar, sólo se permiten URLs http(s)
// (bloquea "javascript:" y similares si algún día logoUrl u otro campo se vuelve más libre).
function safeUrl(value: unknown): string {
  const str = String(value || '').trim();
  if (!/^https?:\/\//i.test(str)) return '';
  return escapeHtml(str);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  DEBIT: 'Tarjeta Débito',
  CREDIT: 'Tarjeta Crédito',
  TRANSFER: 'Transferencia',
  MERCADO_PAGO: 'Mercado Pago',
  CURRENT_ACCOUNT: 'Cuenta Corriente',
};

const CBTE_TIPO_LABELS: Record<number, string> = {
  1: 'FACTURA A',
  6: 'FACTURA B',
  11: 'FACTURA C',
  3: 'NOTA DE CRÉDITO A',
  8: 'NOTA DE CRÉDITO B',
  13: 'NOTA DE CRÉDITO C',
};

// Misma regla que en el frontend (SalesPage): requiere factura ARCA obligatoria toda venta
// a un cliente identificado (CUIT/DNI cargado). Un Consumidor Final anónimo no la requiere.
function requiresInvoice(sale: any): boolean {
  return !!sale.customer?.cuitDni;
}

// GET /api/tickets/sale/:id/html (Returns HTML formatted ticket for browser printing)
router.get('/sale/:id/html', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        customer: true,
        user: { select: { name: true } },
        invoiceARCA: true,
        sucursal: true,
      },
    });

    if (!sale) return res.status(404).send('Venta no encontrada');
    if (req.user?.role !== 'ADMIN' && sale.sucursalId !== req.user?.sucursalId) {
      return res.status(403).send('No tiene acceso a esta venta (pertenece a otra sucursal).');
    }

    const config = await prisma.companyConfig.findFirst() || {
      businessName: 'Artículos de Limpieza Full Clean',
      cuit: '20-40000000-9',
      phone: '011 4444-5555',
      logoUrl: null as string | null,
    };

    const ticketWidth = sale.sucursal.ticketWidth;
    const is58mm = ticketWidth === 58;
    const bodyWidth = is58mm ? '58mm' : '80mm';
    const fontSize = is58mm ? '11px' : '13px';

    const comprobanteLabel = sale.invoiceARCA
      ? (CBTE_TIPO_LABELS[sale.invoiceARCA.cbteTipo] || `COMPROBANTE TIPO ${sale.invoiceARCA.cbteTipo}`)
      : 'TICKET NO FISCAL';

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Ticket #${escapeHtml(sale.saleNumber)}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Courier New', Courier, monospace;
          width: ${bodyWidth};
          margin: 0 auto;
          padding: 8px;
          font-size: ${fontSize};
          line-height: 1.35;
          color: #000;
          background: #fff;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .muted { color: #444; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .logo { max-width: 60%; max-height: 70px; margin: 0 auto 6px; display: block; }
        table { width: 100%; border-collapse: collapse; }
        td, th { padding: 2px 0; }
        .qr-container { margin-top: 10px; text-align: center; }
        .qr-container img { width: 130px; height: 130px; }
        .no-fiscal-badge {
          display: inline-block; margin-top: 4px; padding: 2px 8px;
          border: 1px solid #000; border-radius: 10px; font-size: 10px;
        }
        .print-bar {
          display: flex; gap: 8px; justify-content: center; margin-bottom: 10px;
        }
        .print-bar button {
          font-family: sans-serif; font-size: 13px; padding: 8px 16px;
          border-radius: 8px; border: 1px solid #999; background: #f3f3f3; cursor: pointer;
        }
        @media print {
          .print-bar { display: none; }
          @page { margin: 0; }
          body { margin: 0; }
        }
      </style>
    </head>
    <body onload="window.print()">
      <div class="print-bar">
        <button onclick="window.print()">🖨️ Imprimir</button>
        <button onclick="window.close()">Cerrar</button>
      </div>

      <div class="text-center">
        ${config.logoUrl && safeUrl(config.logoUrl) ? `<img class="logo" src="${safeUrl(config.logoUrl)}" alt="${escapeHtml(config.businessName)}" />` : ''}
        <div class="bold" style="font-size: 16px;">${escapeHtml(config.businessName)}</div>
        <div>CUIT: ${escapeHtml(config.cuit)}</div>
        <div class="bold">${escapeHtml(sale.sucursal.nombre)}</div>
        <div>${escapeHtml(sale.sucursal.direccion || '')}</div>
        <div>Tel: ${escapeHtml(config.phone)}</div>
      </div>
      <div class="divider"></div>
      <div class="bold text-center">${escapeHtml(comprobanteLabel)}</div>
      ${!sale.invoiceARCA ? `<div class="text-center"><span class="no-fiscal-badge">${requiresInvoice(sale) ? '⚠ PENDIENTE DE FACTURAR' : 'Comprobante interno, no válido como factura'}</span></div>` : ''}
      <div>Nº: ${sale.invoiceARCA ? `${sale.invoiceARCA.ptoVta.toString().padStart(4, '0')}-${sale.invoiceARCA.cbteDesde.toString().padStart(8, '0')}` : escapeHtml(sale.saleNumber)}</div>
      <div>Fecha: ${escapeHtml(new Date(sale.createdAt).toLocaleString('es-AR'))}</div>
      <div>Atendido por: ${escapeHtml(sale.user.name)}</div>
      ${sale.customer ? `<div>Cliente: ${escapeHtml(sale.customer.name)}${sale.customer.cuitDni ? ` (${escapeHtml(sale.customer.cuitDni)})` : ''}</div>` : ''}
      ${sale.customer?.ivaCondition ? `<div class="muted">Cond. IVA: ${escapeHtml(sale.customer.ivaCondition)}</div>` : ''}

      <div class="divider"></div>
      <table>
        <thead>
          <tr>
            <th style="text-align: left;">CANT ITEM</th>
            <th class="text-right">P.U.</th>
            <th class="text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${sale.items.map(item => `
            <tr>
              <td colspan="3" class="bold" style="text-align: left;">${escapeHtml(item.productName)}</td>
            </tr>
            <tr>
              <td style="text-align: left;">${item.quantity} x</td>
              <td class="text-right">$${item.unitPrice.toFixed(2)}</td>
              <td class="text-right">$${item.subtotal.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="divider"></div>
      ${sale.discount > 0 ? `<div class="row"><span>Subtotal:</span><span>$${sale.subtotal.toFixed(2)}</span></div><div class="row"><span>Descuento${sale.discountType === 'PERCENTAGE' ? ` (${sale.discountValue}%)` : ''}:</span><span>-$${sale.discount.toFixed(2)}</span></div>` : ''}
      ${sale.invoiceARCA ? `
        <div class="row muted"><span>Neto Gravado:</span><span>$${sale.invoiceARCA.impNeto.toFixed(2)}</span></div>
        <div class="row muted"><span>IVA (21%):</span><span>$${sale.invoiceARCA.impIVA.toFixed(2)}</span></div>
      ` : ''}
      <div class="row bold" style="font-size: 15px;"><span>TOTAL:</span><span>$${sale.total.toFixed(2)}</span></div>

      <div class="divider"></div>
      <div class="bold">Forma(s) de Pago:</div>
      ${sale.payments.map(p => `
        <div class="row"><span>${escapeHtml(PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod)}${p.cardType ? ` (${escapeHtml(p.cardType)}${p.installments ? `, ${p.installments} cuota${p.installments > 1 ? 's' : ''}` : ''})` : ''}:</span><span>$${p.amount.toFixed(2)}</span></div>
      `).join('')}

      ${sale.invoiceARCA ? `
        <div class="divider"></div>
        <div class="text-center">
          <div class="bold">CAE: ${escapeHtml(sale.invoiceARCA.cae)}</div>
          <div>Vto CAE: ${escapeHtml(sale.invoiceARCA.caeVto)}</div>
          ${sale.invoiceARCA.afipQrUrl ? `
            <div class="qr-container">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(sale.invoiceARCA.afipQrUrl)}" alt="QR ARCA" />
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="divider"></div>
      <div class="text-center bold">¡Gracias por su compra!</div>
    </body>
    </html>
    `;

    return res.send(html);
  } catch (error: any) {
    return res.status(500).send(error.message);
  }
});

// POST /api/tickets/sale/:id/print (Thermal printing via ESC/POS to connected printer)
router.post('/sale/:id/print', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { items: true, payments: true, customer: true, user: { select: { name: true } }, invoiceARCA: true, sucursal: true },
    });

    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    if (req.user?.role !== 'ADMIN' && sale.sucursalId !== req.user?.sucursalId) {
      return res.status(403).json({ error: 'No tiene acceso a esta venta (pertenece a otra sucursal).' });
    }

    const config = await prisma.companyConfig.findFirst();
    if (!config || sale.sucursal.printerInterface === 'NONE') {
      return res.json({ message: 'Esta sucursal no tiene una impresora térmica ESC/POS configurada. Use la opción de impresión por navegador.' });
    }

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: sale.sucursal.printerAddress || 'tcp://127.0.0.1:9100',
      characterSet: CharacterSet.SLOVENIA,
    });

    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(config.businessName);
    printer.bold(false);
    printer.setTextSize(0, 0);
    printer.println(`CUIT: ${config.cuit}`);
    printer.println(sale.sucursal.nombre);
    printer.println(sale.sucursal.direccion || '');
    printer.println(`Tel: ${config.phone}`);
    printer.drawLine();

    printer.bold(true);
    printer.println(sale.invoiceARCA ? (CBTE_TIPO_LABELS[sale.invoiceARCA.cbteTipo] || 'COMPROBANTE') : 'TICKET NO FISCAL');
    printer.bold(false);
    if (!sale.invoiceARCA && requiresInvoice(sale)) {
      printer.println('*** PENDIENTE DE FACTURAR ***');
    }
    printer.println(`Nº: ${sale.invoiceARCA ? `${sale.invoiceARCA.ptoVta.toString().padStart(4, '0')}-${sale.invoiceARCA.cbteDesde.toString().padStart(8, '0')}` : sale.saleNumber}`);
    printer.println(`Fecha: ${new Date(sale.createdAt).toLocaleString('es-AR')}`);
    printer.println(`Atendido por: ${sale.user.name}`);
    if (sale.customer) {
      printer.println(`Cliente: ${sale.customer.name}${sale.customer.cuitDni ? ` (${sale.customer.cuitDni})` : ''}`);
    }
    printer.drawLine();

    printer.alignLeft();
    for (const item of sale.items) {
      printer.bold(true);
      printer.println(item.productName);
      printer.bold(false);
      printer.println(`${item.quantity} x $${item.unitPrice.toFixed(2)} = $${item.subtotal.toFixed(2)}`);
    }

    printer.drawLine();
    if (sale.discount > 0) {
      printer.println(`Subtotal: $${sale.subtotal.toFixed(2)}`);
      printer.println(`Descuento${sale.discountType === 'PERCENTAGE' ? ` (${sale.discountValue}%)` : ''}: -$${sale.discount.toFixed(2)}`);
    }
    if (sale.invoiceARCA) {
      printer.println(`Neto Gravado: $${sale.invoiceARCA.impNeto.toFixed(2)}`);
      printer.println(`IVA (21%): $${sale.invoiceARCA.impIVA.toFixed(2)}`);
    }
    printer.bold(true);
    printer.println(`TOTAL: $${sale.total.toFixed(2)}`);
    printer.bold(false);

    printer.drawLine();
    printer.println('Forma(s) de Pago:');
    for (const p of sale.payments) {
      const cardInfo = p.cardType ? ` (${p.cardType}${p.installments ? `, ${p.installments} cuota${p.installments > 1 ? 's' : ''}` : ''})` : '';
      printer.println(`${PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod}${cardInfo}: $${p.amount.toFixed(2)}`);
    }

    if (sale.invoiceARCA) {
      printer.drawLine();
      printer.alignCenter();
      printer.println(`CAE: ${sale.invoiceARCA.cae}`);
      printer.println(`Vto. CAE: ${sale.invoiceARCA.caeVto}`);
      if (sale.invoiceARCA.afipQrUrl) {
        try {
          printer.printQR(sale.invoiceARCA.afipQrUrl, { cellSize: 6 });
        } catch {
          // Si la impresora/librería no soporta QR, se omite sin romper el resto del ticket.
        }
      }
    }

    printer.drawLine();
    printer.alignCenter();
    printer.println('¡Gracias por su compra!');
    printer.cut();

    try {
      await printer.execute();
      return res.json({ message: 'Ticket impreso correctamente en la impresora térmica.' });
    } catch (printErr: any) {
      return res.status(500).json({ error: 'Error al enviar a la impresora térmica.', details: printErr.message });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
