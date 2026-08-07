import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { getSucursalesForUser, userCanAccessSucursal } from '../utils/sucursales';
import { loginRateLimit, registerFailedLogin, clearFailedLogins } from '../middleware/loginRateLimit';

const router = Router();

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

// POST /api/auth/login
// Devuelve un token. Si el usuario tiene una sola sucursal disponible, queda seleccionada automáticamente.
// Si tiene varias (o es ADMIN), el frontend debe llamar a /api/auth/select-sucursal antes de operar caja/ventas/stock.
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Por favor ingrese usuario y contraseña.' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    if (!user || !user.active) {
      registerFailedLogin(req);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      registerFailedLogin(req);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    clearFailedLogins(req);
    const sucursales = await getSucursalesForUser(user.id, user.role);

    if (sucursales.length === 0) {
      return res.status(403).json({
        error: 'Este usuario no tiene ninguna sucursal asignada. Contacte a un administrador.',
      });
    }

    const basePayload = { id: user.id, username: user.username, name: user.name, role: user.role };

    // Auto-seleccionar sucursal si solo hay una disponible
    if (sucursales.length === 1) {
      const sucursal = sucursales[0];
      const token = signToken({ ...basePayload, sucursalId: sucursal.id, sucursalNombre: sucursal.nombre });
      return res.json({
        token,
        user: { id: user.id, username: user.username, name: user.name, role: user.role },
        sucursales,
        activeSucursal: sucursal,
      });
    }

    const token = signToken(basePayload);
    return res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
      sucursales,
      activeSucursal: null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Error en el servidor al iniciar sesión.', details: error.message });
  }
});

// POST /api/auth/select-sucursal (elegir o cambiar la sucursal activa de la sesión)
router.post('/select-sucursal', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { sucursalId } = req.body;
    if (!sucursalId) return res.status(400).json({ error: 'Debe indicar una sucursal.' });
    if (!req.user) return res.status(401).json({ error: 'No autenticado.' });

    const id = parseInt(sucursalId);
    const canAccess = await userCanAccessSucursal(req.user.id, req.user.role, id);
    if (!canAccess) {
      return res.status(403).json({ error: 'No tiene acceso a la sucursal seleccionada.' });
    }

    const sucursal = await prisma.sucursal.findUnique({ where: { id } });
    if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });

    const token = signToken({
      id: req.user.id,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
      sucursalId: sucursal.id,
      sucursalNombre: sucursal.nombre,
    });

    return res.json({ token, activeSucursal: sucursal });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, name: true, role: true, active: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado.' });
    }

    const sucursales = await getSucursalesForUser(user.id, user.role);
    const activeSucursal = req.user.sucursalId
      ? sucursales.find((s) => s.id === req.user!.sucursalId) || (await prisma.sucursal.findUnique({ where: { id: req.user.sucursalId } }))
      : null;

    return res.json({ user, sucursales, activeSucursal });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/auth/users (ADMIN)
router.get('/users', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
        sucursales: { include: { sucursal: { select: { id: true, nombre: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(users);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/users (ADMIN)
router.post('/users', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { username, password, name, role, sucursalIds } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Campos obligatorios requeridos (usuario, contraseña, nombre).' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const existing = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya se encuentra registrado.' });
    }

    const resolvedRole = role || 'VENDEDOR';
    if (resolvedRole !== 'ADMIN' && (!sucursalIds || sucursalIds.length === 0)) {
      return res.status(400).json({ error: 'Debe asignar al menos una sucursal a los usuarios que no son ADMIN.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username: username.toLowerCase().trim(),
        passwordHash,
        name,
        role: resolvedRole,
        sucursales: sucursalIds
          ? { create: sucursalIds.map((sucursalId: number) => ({ sucursalId: parseInt(sucursalId as any) })) }
          : undefined,
      },
      select: { id: true, username: true, name: true, role: true, active: true },
    });

    return res.status(201).json(newUser);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/auth/users/:id (ADMIN)
router.put('/users/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, role, active, password, sucursalIds } = req.body;

    if (password && password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data,
        select: { id: true, username: true, name: true, role: true, active: true },
      });

      if (sucursalIds !== undefined) {
        await tx.userSucursal.deleteMany({ where: { userId: id } });
        if (Array.isArray(sucursalIds) && sucursalIds.length > 0) {
          await tx.userSucursal.createMany({
            data: sucursalIds.map((sucursalId: number) => ({ userId: id, sucursalId: parseInt(sucursalId as any) })),
          });
        }
      }

      return u;
    });

    return res.json(updatedUser);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
