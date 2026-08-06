import { Router } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// GET /api/sucursales (ADMIN: todas; otros roles: no aplica, usan /api/auth/me para ver las suyas)
router.get('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const sucursales = await prisma.sucursal.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { usuarios: true } } },
    });
    return res.json(sucursales);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/sucursales (ADMIN)
router.post('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { nombre, direccion, telefono, ptoVtaArca, ticketWidth, printerInterface, printerAddress } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre de la sucursal es obligatorio.' });

    const sucursal = await prisma.sucursal.create({
      data: {
        nombre: nombre.trim(),
        direccion,
        telefono,
        ptoVtaArca: ptoVtaArca ? parseInt(ptoVtaArca) : 1,
        ticketWidth: ticketWidth ? parseInt(ticketWidth) : 80,
        printerInterface: printerInterface || 'NONE',
        printerAddress: printerAddress || '',
      },
    });
    return res.status(201).json(sucursal);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/sucursales/:id (ADMIN)
router.put('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { nombre, direccion, telefono, ptoVtaArca, ticketWidth, printerInterface, printerAddress, activa } = req.body;

    const data: any = {};
    if (nombre !== undefined) data.nombre = nombre.trim();
    if (direccion !== undefined) data.direccion = direccion;
    if (telefono !== undefined) data.telefono = telefono;
    if (ptoVtaArca !== undefined) data.ptoVtaArca = parseInt(ptoVtaArca);
    if (ticketWidth !== undefined) data.ticketWidth = parseInt(ticketWidth);
    if (printerInterface !== undefined) data.printerInterface = printerInterface;
    if (printerAddress !== undefined) data.printerAddress = printerAddress;
    if (activa !== undefined) data.activa = Boolean(activa);

    const sucursal = await prisma.sucursal.update({ where: { id }, data });
    return res.json(sucursal);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/sucursales/:id/usuarios (ADMIN) — usuarios asignados a la sucursal
router.get('/:id/usuarios', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const sucursalId = parseInt(req.params.id);
    const asignaciones = await prisma.userSucursal.findMany({
      where: { sucursalId },
      include: { user: { select: { id: true, name: true, username: true, role: true, active: true } } },
    });
    return res.json(asignaciones.map((a) => a.user));
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
