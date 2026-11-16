import { Router } from 'express';
import { prisma } from '../db/prisma';
import { serverError } from '../utils/errors';

const router = Router();

// GET /api/public/legal — datos de contacto de la empresa para las páginas públicas
// (política de privacidad, términos, contacto). Sin autenticación a propósito: esas páginas
// deben poder leerse sin iniciar sesión. Solo se exponen los datos que ya figuran en cada
// ticket y factura impresos (razón social, CUIT, domicilio, teléfono, email); nada interno.
router.get('/legal', async (_req, res) => {
  try {
    const config = await prisma.companyConfig.findFirst({
      select: { businessName: true, cuit: true, address: true, phone: true, email: true },
    });
    return res.json(config ?? { businessName: 'Full Clean', cuit: '', address: '', phone: '', email: '' });
  } catch (error: any) {
    return serverError(res, error);
  }
});

export default router;
