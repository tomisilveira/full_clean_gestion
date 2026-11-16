import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { getSucursalesForUser, userCanAccessSucursal } from '../utils/sucursales';
import { loginRateLimit, registerFailedLogin, clearFailedLogins } from '../middleware/loginRateLimit';
import { serverError } from '../utils/errors';
import { z } from 'zod';
import { parseBody, parseId } from '../utils/validation';

const router = Router();

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

// Costo de bcrypt. Se mantiene en 10 (mínimo recomendado por OWASP): bcryptjs es JavaScript
// puro y a costo 12 un login tarda ~0,8 s de CPU en una PC y varios segundos en un hosting
// chico, bloqueando el proceso. Para subirlo conviene migrar a bcrypt nativo o argon2.
// Además, igualar el costo con los hashes ya guardados es lo que hace que el hash
// descartable de abajo tarde lo mismo que una verificación real.
const BCRYPT_ROUNDS = 10;

// Hash descartable para gastar el mismo tiempo de bcrypt cuando el usuario no existe. Sin
// esto, "usuario inexistente" respondía mucho más rápido que "contraseña incorrecta" y
// permitía averiguar por timing qué usuarios existen.
const DUMMY_HASH = bcrypt.hashSync('contraseña-descartable', BCRYPT_ROUNDS);

const ROLES = ['ADMIN', 'VENDEDOR', 'SOLO_CONSULTA'] as const;

// bcrypt ignora en silencio todo lo que pasa de 72 bytes: se limita para no aceptar una
// contraseña "larga" que en realidad solo se verifica en sus primeros 72 caracteres.
const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña no puede superar los 72 caracteres.');

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

const sucursalIdsSchema = z.array(z.coerce.number().int().positive()).max(100);

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'El usuario debe tener al menos 3 caracteres.')
    .max(50)
    .regex(/^[a-z0-9._-]+$/, 'El usuario solo puede tener letras, números, punto, guion y guion bajo.'),
  password: passwordSchema,
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(100),
  role: z.enum(ROLES).default('VENDEDOR'),
  sucursalIds: sucursalIdsSchema.optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional().or(z.literal('')),
  sucursalIds: sucursalIdsSchema.optional(),
});

// POST /api/auth/login
// Devuelve un token. Si el usuario tiene una sola sucursal disponible, queda seleccionada automáticamente.
// Si tiene varias (o es ADMIN), el frontend debe llamar a /api/auth/select-sucursal antes de operar caja/ventas/stock.
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Por favor ingrese usuario y contraseña.' });
    }
    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    // Se compara siempre contra algún hash (el real o uno descartable) para que el tiempo
    // de respuesta no delate si el usuario existe.
    const isMatch = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !user.active || !isMatch) {
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
    return serverError(res, error);
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
    return serverError(res, error);
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
    return serverError(res, error);
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
    return serverError(res, error);
  }
});

// POST /api/auth/users (ADMIN)
router.post('/users', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { username, password, name, role, sucursalIds } = parseBody(createUserSchema, req.body);

    const existing = await prisma.user.findUnique({ where: { username } });

    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya se encuentra registrado.' });
    }

    if (role !== 'ADMIN' && (!sucursalIds || sucursalIds.length === 0)) {
      return res.status(400).json({ error: 'Debe asignar al menos una sucursal a los usuarios que no son ADMIN.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        name,
        role,
        sucursales: sucursalIds
          ? { create: sucursalIds.map((sucursalId) => ({ sucursalId })) }
          : undefined,
      },
      select: { id: true, username: true, name: true, role: true, active: true },
    });

    return res.status(201).json(newUser);
  } catch (error: any) {
    return serverError(res, error);
  }
});

// PUT /api/auth/users/:id (ADMIN)
router.put('/users/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { name, role, active, password, sucursalIds } = parseBody(updateUserSchema, req.body);

    // Evita que un ADMIN se quite el acceso a sí mismo (desactivarse o bajarse el rol) y
    // deje el sistema sin ningún administrador que pueda corregirlo.
    const self = (req as AuthRequest).user;
    if (self && self.id === id && (active === false || (role !== undefined && role !== 'ADMIN'))) {
      return res.status(400).json({ error: 'No podés desactivar tu propio usuario ni quitarte el rol de administrador.' });
    }

    const data: { name?: string; role?: string; active?: boolean; passwordHash?: string } = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (password) data.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data,
        select: { id: true, username: true, name: true, role: true, active: true },
      });

      if (sucursalIds !== undefined) {
        await tx.userSucursal.deleteMany({ where: { userId: id } });
        if (sucursalIds.length > 0) {
          await tx.userSucursal.createMany({
            data: sucursalIds.map((sucursalId) => ({ userId: id, sucursalId })),
          });
        }
      }

      return u;
    });

    return res.json(updatedUser);
  } catch (error: any) {
    return serverError(res, error);
  }
});

export default router;
