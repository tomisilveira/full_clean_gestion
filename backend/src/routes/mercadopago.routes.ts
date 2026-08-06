import { Router, Request, Response } from 'express';
import { MercadoPagoConfig, Preference, Payment as MPPayment } from 'mercadopago';
import { prisma } from '../db/prisma';
import { authenticateToken, requireSucursal, AuthRequest } from '../middleware/auth';

const router = Router();

// Helper to initialize Mercado Pago Client
function getMPClient() {
  const token = process.env.MP_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
  return new MercadoPagoConfig({ accessToken: token });
}

// POST /api/mercadopago/preference (Create Checkout Pro Link or QR data for sale)
// La venta se identifica por saleId (external_reference) para poder conciliarla luego vía webhook.
// La venta ya tiene sucursalId asociado, así que no hace falta pasarlo aparte.
router.post('/preference', authenticateToken, requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const { saleId, title, price, quantity } = req.body;

    const client = getMPClient();
    const preference = new Preference(client);

    const body = {
      items: [
        {
          id: saleId ? saleId.toString() : 'POS_SALE',
          title: title || 'Compra en Artículos de Limpieza Full Clean',
          quantity: parseInt(quantity || 1),
          unit_price: parseFloat(price),
          currency_id: 'ARS',
        },
      ],
      back_urls: {
        success: 'http://localhost:5173/sales?mp_status=success',
        failure: 'http://localhost:5173/sales?mp_status=failure',
        pending: 'http://localhost:5173/sales?mp_status=pending',
      },
      auto_return: 'approved',
      external_reference: saleId ? saleId.toString() : undefined,
      notification_url: process.env.MP_WEBHOOK_URL || 'http://localhost:4000/api/mercadopago/webhook',
    };

    const response = await preference.create({ body });

    return res.json({
      id: response.id,
      init_point: response.init_point,
      sandbox_init_point: response.sandbox_init_point,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/mercadopago/webhook (Reconcile MP payment against sale)
// Público (sin auth): Mercado Pago llama a esta URL directamente. La seguridad se basa en
// re-consultar el pago con nuestro Access Token en vez de confiar en el body de la notificación.
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;
    console.log('🔔 Mercado Pago Webhook Notificación:', type, data);

    if (type !== 'payment' || !data?.id) {
      return res.status(200).send('OK');
    }

    const client = getMPClient();
    const paymentClient = new MPPayment(client);
    const mpPayment = await paymentClient.get({ id: data.id });

    const saleId = mpPayment.external_reference ? parseInt(mpPayment.external_reference) : null;
    if (!saleId) {
      console.warn('⚠️ Webhook de Mercado Pago sin external_reference (saleId) asociado.');
      return res.status(200).send('OK');
    }

    if (mpPayment.status !== 'approved') {
      console.log(`ℹ️ Pago MP ${data.id} para venta #${saleId} en estado "${mpPayment.status}" (no conciliado hasta que sea "approved").`);
      return res.status(200).send('OK');
    }

    const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { payments: true } });
    if (!sale) {
      console.warn(`⚠️ Webhook de Mercado Pago referencia una venta inexistente (#${saleId}).`);
      return res.status(200).send('OK');
    }

    // Idempotencia: si ya se conciliό este pago de MP, no duplicar.
    const alreadyReconciled = sale.payments.some((p) => p.paymentMethod === 'MERCADO_PAGO' && p.reference === String(data.id));
    if (alreadyReconciled) {
      return res.status(200).send('OK');
    }

    const amount = mpPayment.transaction_amount || 0;

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          saleId: sale.id,
          paymentMethod: 'MERCADO_PAGO',
          amount,
          reference: String(data.id),
        },
      });

      const activeSession = await tx.cashSession.findFirst({
        where: { status: 'OPEN', sucursalId: sale.sucursalId },
      });

      if (activeSession) {
        await tx.cashMovement.create({
          data: {
            sessionId: activeSession.id,
            type: 'SALE',
            paymentMethod: 'MERCADO_PAGO',
            amount,
            notes: `Conciliación automática Mercado Pago (pago #${data.id}) - Venta #${sale.saleNumber}`,
            userId: sale.userId,
          },
        });
      } else {
        console.warn(`⚠️ Pago de MP conciliado para venta #${sale.saleNumber}, pero la caja de su sucursal (#${sale.sucursalId}) está cerrada: no se registró el movimiento de caja.`);
      }
    });

    console.log(`✅ Pago de Mercado Pago ${data.id} conciliado contra venta #${sale.saleNumber} (sucursal #${sale.sucursalId}).`);
    return res.status(200).send('OK');
  } catch (error: any) {
    console.error('Error procesando webhook de Mercado Pago:', error);
    return res.status(500).send(error.message);
  }
});

export default router;
