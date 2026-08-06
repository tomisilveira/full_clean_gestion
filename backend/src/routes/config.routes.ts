import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Carpeta convencional de certificados ARCA: backend/certs/{homologacion,produccion}.{crt,key}
// Se resuelve siempre relativo a este archivo (no depende del cwd del proceso).
export const CERTS_DIR = path.resolve(__dirname, '../../certs');
if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

const certStorage = multer.diskStorage({
  destination: CERTS_DIR,
  filename: (req, file, cb) => {
    const environment = req.params.environment === 'produccion' ? 'produccion' : 'homologacion';
    const ext = file.fieldname === 'keyFile' ? 'key' : 'crt';
    cb(null, `${environment}.${ext}`);
  },
});
const certUpload = multer({ storage: certStorage, limits: { fileSize: 512 * 1024 } }); // 512KB de sobra para un cert/key

function certFileStatus(filePath: string) {
  if (!fs.existsSync(filePath)) return { uploaded: false, updatedAt: null };
  return { uploaded: true, updatedAt: fs.statSync(filePath).mtime };
}

// GET /api/config
router.get('/', authenticateToken, async (req, res) => {
  try {
    let config = await prisma.companyConfig.findFirst();
    if (!config) {
      config = await prisma.companyConfig.create({ data: {} });
    }
    return res.json(config);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/config (ADMIN only)
router.put('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const {
      businessName,
      cuit,
      ivaCondition,
      address,
      phone,
      email,
      logoUrl,
      arcaHomo,
    } = req.body;

    let config = await prisma.companyConfig.findFirst();
    const data: any = {
      businessName,
      cuit,
      ivaCondition,
      address,
      phone,
      email,
      logoUrl,
      arcaHomo: arcaHomo !== undefined ? Boolean(arcaHomo) : undefined,
    };

    if (config) {
      config = await prisma.companyConfig.update({
        where: { id: config.id },
        data,
      });
    } else {
      config = await prisma.companyConfig.create({ data });
    }

    return res.json(config);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/config/arca-cert/status (ADMIN) — qué certificados hay cargados, por ambiente
router.get('/arca-cert/status', authenticateToken, requireRole(['ADMIN']), (req, res) => {
  try {
    return res.json({
      homologacion: {
        cert: certFileStatus(path.join(CERTS_DIR, 'homologacion.crt')),
        key: certFileStatus(path.join(CERTS_DIR, 'homologacion.key')),
      },
      produccion: {
        cert: certFileStatus(path.join(CERTS_DIR, 'produccion.crt')),
        key: certFileStatus(path.join(CERTS_DIR, 'produccion.key')),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/config/arca-cert/:environment (ADMIN) — subir certificado y/o clave privada de ARCA
// :environment = 'homologacion' | 'produccion'. Se pueden subir juntos o por separado
// (ej. solo renovar el .crt sin tocar la clave privada).
router.post(
  '/arca-cert/:environment',
  authenticateToken,
  requireRole(['ADMIN']),
  certUpload.fields([
    { name: 'certFile', maxCount: 1 },
    { name: 'keyFile', maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const environment = req.params.environment === 'produccion' ? 'produccion' : 'homologacion';
      const files = req.files as { certFile?: Express.Multer.File[]; keyFile?: Express.Multer.File[] } | undefined;

      if (!files?.certFile?.length && !files?.keyFile?.length) {
        return res.status(400).json({ error: 'Debe adjuntar el certificado (.crt), la clave privada (.key), o ambos.' });
      }

      return res.json({
        message: `Certificado de ${environment} actualizado correctamente.`,
        uploaded: {
          cert: !!files?.certFile?.length,
          key: !!files?.keyFile?.length,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
);

export default router;
