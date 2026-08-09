import Afip from '@afipsdk/afip.js';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma';
import { CERTS_DIR } from '../routes/config.routes';

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

export function getAfipClient(config: any) {
  const isProduction = process.env.AFIP_PRODUCTION === 'true' || !config.arcaHomo;
  const envSuffix = isProduction ? 'produccion' : 'homologacion';

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

export interface ArcaEmitParams {
  total: number;
  ptoVta: number;
  config: { cuit?: string; ivaCondition?: string; arcaHomo?: boolean };
  customerCuitDni?: string | null;
  customerIvaCondition?: string | null;
  cbteTipoOverride?: number | string;
}

export interface ArcaEmitResult {
  cbteTipo: number;
  ptoVta: number;
  cbteDesde: bigint;
  cbteHasta: bigint;
  cbteFch: string;
  impTotal: number;
  impNeto: number;
  impIVA: number;
  cae: string;
  caeVto: string;
  afipQrUrl: string;
  result: 'A';
}

// Emite (o simula, si no hay certificados cargados) un comprobante electrónico ante ARCA
// para un monto total dado. Compartido por la facturación de ventas del POS
// (arca.routes.ts) y la facturación libre (manualInvoices.routes.ts) — misma lógica de
// comunicación con AFIP en los dos casos, para no duplicarla.
export async function emitArcaVoucher(params: ArcaEmitParams): Promise<ArcaEmitResult> {
  const { total, ptoVta, config, customerCuitDni, customerIvaCondition, cbteTipoOverride } = params;

  // Determine CbteTipo:
  // 1: Factura A (Cliente Responsable Inscripto)
  // 6: Factura B (Emisor Resp Inscripto -> Consumidor Final / Monotributo)
  // 11: Factura C (Emisor Monotributista)
  let cbteTipo = 6;
  if (cbteTipoOverride) {
    cbteTipo = parseInt(cbteTipoOverride as string);
  } else if (config.ivaCondition === 'Monotributo') {
    cbteTipo = 11;
  } else if (customerIvaCondition === 'Responsable Inscripto') {
    cbteTipo = 1;
  }

  const { afip, hasCerts, cuit } = getAfipClient(config);

  let cae = '';
  let caeVto = '';
  let cbteNumero: bigint = BigInt(1);
  let afipQrUrl = '';

  if (afip && hasCerts) {
    const lastCbte = await afip.ElectronicBilling.getLastVoucher(ptoVta, cbteTipo);
    cbteNumero = BigInt(lastCbte + 1);

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const data: any = {
      CantReg: 1,
      PtoVta: ptoVta,
      CbteTipo: cbteTipo,
      Concepto: 1, // 1: Productos
      DocTipo: customerCuitDni ? (customerCuitDni.length === 11 ? 80 : 96) : 99, // 80: CUIT, 96: DNI, 99: Sin Informar
      DocNro: customerCuitDni ? parseInt(customerCuitDni.replace(/[-_]/g, '')) : 0,
      CbteDesde: cbteNumero.toString(),
      CbteHasta: cbteNumero.toString(),
      CbteFch: todayStr,
      ImpTotal: total,
      ImpTotConc: 0,
      ImpNeto: Math.round((total / 1.21) * 100) / 100,
      ImpOpEx: 0,
      ImpIVA: Math.round((total - total / 1.21) * 100) / 100,
      ImpTrib: 0,
      MonId: 'PES',
      MonCot: 1,
    };

    if (cbteTipo === 1 || cbteTipo === 6) {
      data.Iva = [
        {
          Id: 5, // 21%
          BaseImp: Math.round((total / 1.21) * 100) / 100,
          Importe: Math.round((total - total / 1.21) * 100) / 100,
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
        ptoVta,
        tipoCmp: cbteTipo,
        nroCmp: Number(cbteNumero),
        importe: total,
        moneda: 'PES',
        ctz: 1,
        tipoDocRec: data.DocTipo,
        nroDocRec: data.DocNro,
        tipoCodAut: 'E',
        codAut: parseInt(cae),
      })
    ).toString('base64')}`;
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

  const impNeto = Math.round((total / 1.21) * 100) / 100;
  const impIVA = Math.round((total - impNeto) * 100) / 100;

  return {
    cbteTipo,
    ptoVta,
    cbteDesde: cbteNumero,
    cbteHasta: cbteNumero,
    cbteFch: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    impTotal: total,
    impNeto,
    impIVA,
    cae,
    caeVto,
    afipQrUrl,
    result: 'A',
  };
}
