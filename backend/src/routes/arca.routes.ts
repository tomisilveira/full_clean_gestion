import { Router, Response } from 'express';
import Afip from '@afipsdk/afip.js';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { CERTS_DIR } from './config.routes';

const router = Router();

// Resuelve la ruta de un archivo de certificado: si la variable de entorno apunta a un
// archivo que realmente existe, se respeta (override manual/avanzado). Si no, se usa la
// convención backend/certs/{homologacion,produccion}.{crt,key} que administra la UI de
// Configuración → Empresa, para que cargar el certificado de cualquier empresa sea un
// simple upload y no requiera tocar variables de entorno ni el filesystem del servidor.
function resolveCertFile(envVar: string | undefined, conventionalPath: string): string {
  if (envVar) {
    const resolved = path.resolve(envVar);
    if (fs.existsSync(resolved)) return resolved;
  }
  return conventionalPath;
}

// Helper to initialize AFIP SDK
function getAfipClient(config: any) {
  const isProduction = process.env.AFIP_PRODUCTION === 'true' || !config.arcaHomo;
  const envSuffix = isProduction ? 'produccion' : 'homologacion';

  // El CUIT se toma primero de la configuración de la empresa (editable desde la UI);
  // la variable de entorno queda solo como fallback para despliegues que no la hayan configurado.
  const cuit = (config.cuit || '').replace(/[-_]/g, '') || process.env.AFIP_CUIT || '';

  const certPath = resolveCertFile(process.env.AFIP_CERT_PATH, path.join(CERTS_DIR, `${envSuffix}.crt`));
  const keyPath = resolveCertFile(process.env.AFIP_KEY_PATH, path.join(CERTS_DIR, `${envSuffix}.key`));

  const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (!hasCerts) {
    return { afip: null, isProduction, cuit, hasCerts: false };
  }

  const afip = new Afip({
    CUIT: parseInt(cuit),
    production: isProduction,
    cert: certPath,
    key: keyPath,
  });

  return { afip, isProduction, cuit, hasCerts: true };
}

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

    // Determine CbteTipo:
    // 1: Factura A (Cliente Responsable Inscripto)
    // 6: Factura B (Emisor Resp Inscripto -> Consumidor Final / Monotributo)
    // 11: Factura C (Emisor Monotributista)
    let cbteTipo = 6;
    if (cbteTipoOverride) {
      cbteTipo = parseInt(cbteTipoOverride);
    } else if (config.ivaCondition === 'Monotributo') {
      cbteTipo = 11;
    } else if (sale.customer?.ivaCondition === 'Responsable Inscripto') {
      cbteTipo = 1;
    }

    const { afip, hasCerts, cuit } = getAfipClient(config);

    let cae = '';
    let caeVto = '';
    let cbteNumero: bigint = BigInt(1);
    let afipQrUrl = '';

    if (afip && hasCerts) {
      try {
        // Query last authorized invoice number
        const lastCbte = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
        cbteNumero = BigInt(lastCbte + 1);

        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        const data: any = {
          CantReg: 1,
          PtoVta: ptoVta,
          CbteTipo: cbteTipo,
          Concepto: 1, // 1: Productos
          DocTipo: sale.customer?.cuitDni ? (sale.customer.cuitDni.length === 11 ? 80 : 96) : 99, // 80: CUIT, 96: DNI, 99: Sin Informar
          DocNro: sale.customer?.cuitDni ? parseInt(sale.customer.cuitDni.replace(/[-_]/g, '')) : 0,
          CbteDesde: cbteNumero.toString(),
          CbteHasta: cbteNumero.toString(),
          CbteFch: todayStr,
          ImpTotal: sale.total,
          ImpTotConc: 0,
          ImpNeto: Math.round((sale.total / 1.21) * 100) / 100,
          ImpOpEx: 0,
          ImpIVA: Math.round((sale.total - sale.total / 1.21) * 100) / 100,
          ImpTrib: 0,
          MonId: 'PES',
          MonCot: 1,
        };

        if (cbteTipo === 1 || cbteTipo === 6) {
          data.Iva = [
            {
              Id: 5, // 21%
              BaseImp: Math.round((sale.total / 1.21) * 100) / 100,
              Importe: Math.round((sale.total - sale.total / 1.21) * 100) / 100,
            },
          ];
        }

        const resAFIP = await afip.ElectronicBilling.createVoucher(data);
        cae = resAFIP.CAE;
        caeVto = resAFIP.CAEFchVto;

        afipQrUrl = `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(
          JSON.stringify({
            ver: 1,
            fecha: todayStr,
            cuit: parseInt(cuit),
            ptoVta: ptoVta,
            tipoCmp: cbteTipo,
            nroCmp: Number(cbteNumero),
            importe: sale.total,
            moneda: 'PES',
            ctz: 1,
            tipoDocRec: data.DocTipo,
            nroDocRec: data.DocNro,
            tipoCodAut: 'E',
            codAut: parseInt(cae),
          })
        ).toString('base64')}`;

      } catch (afipErr: any) {
        console.error('Error al comunicar con webservice AFIP/ARCA:', afipErr);
        return res.status(500).json({
          error: 'Error de comunicación con el webservice de ARCA (AFIP).',
          details: afipErr.message || afipErr,
        });
      }
    } else {
      // Homologation/Mock fallback for testing without certificates
      const countInvoices = await prisma.invoiceARCA.count();
      cbteNumero = BigInt(countInvoices + 100);
      cae = `743${Math.floor(10000000000 + Math.random() * 90000000000)}`;
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + 10);
      caeVto = expDate.toISOString().slice(0, 10).replace(/-/g, '');

      afipQrUrl = `https://www.afip.gob.ar/fe/qr/?p=TEST_MOCK_HOMOLOGACION_${cbteNumero}`;
    }

    const impNeto = Math.round((sale.total / 1.21) * 100) / 100;
    const impIVA = Math.round((sale.total - impNeto) * 100) / 100;

    const invoice = await prisma.invoiceARCA.create({
      data: {
        saleId,
        cbteTipo,
        ptoVta,
        cbteDesde: cbteNumero,
        cbteHasta: cbteNumero,
        cbteFch: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        impTotal: sale.total,
        impNeto,
        impIVA,
        cae,
        caeVto,
        afipQrUrl,
        result: 'A',
      },
    });

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
