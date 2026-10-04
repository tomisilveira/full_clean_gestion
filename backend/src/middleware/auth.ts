import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    name: string;
    role: string;
    sucursalId?: number;
    sucursalNombre?: string;
  };
}

// JWT_SECRET es obligatorio en todos los entornos y no tiene valor por defecto: el repo es
// público, así que cualquier secreto escrito acá permitiría a cualquiera forjar tokens
// válidos (incluso de ADMIN) sin conocer ninguna contraseña. En desarrollo se define en
// backend/.env (ver backend/.env.example).
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está configurado. Definilo en backend/.env (ver .env.example) o como variable de entorno.');
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      // 401 (no autenticado), no 403 (no autorizado): el interceptor de axios del
      // frontend solo limpia la sesión vencida y redirige a /login ante un 401. Si esto
      // devolviera 403 (como antes), quedaría indistinguible de un 403 por falta de
      // permisos (requireRole) y el usuario se quedaba viendo el error en loop en vez de
      // que lo mandaran a loguearse de nuevo.
      return res.status(401).json({ error: 'Token inválido o expirado.' });
    }

    const payload = decoded as AuthRequest['user'];

    // Revalidar el usuario contra la base en cada request: el JWT solo prueba que en su
    // momento se logueó, pero es válido por 24hs y no se puede revocar por sí mismo. Sin
    // esto, desactivar un usuario o bajarle el rol (PUT /api/auth/users/:id) no tenía
    // efecto real hasta que el token expirara solo. Se usa el rol vigente en base (no el
    // del token) para que un cambio de permisos aplique de inmediato.
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: payload!.id },
        select: { active: true, role: true },
      });
      if (!dbUser || !dbUser.active) {
        return res.status(401).json({ error: 'Usuario inactivo o eliminado. Vuelva a iniciar sesión.' });
      }
      req.user = { ...payload!, role: dbUser.role };
      next();
    } catch (dbErr) {
      return res.status(500).json({ error: 'Error verificando la sesión.' });
    }
  });
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permisos suficientes para realizar esta acción.' });
    }
    next();
  };
};

// La mayoría de las operaciones (caja, ventas, stock) requieren una sucursal activa seleccionada.
export const requireSucursal = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Usuario no autenticado.' });
  }
  if (!req.user.sucursalId) {
    return res.status(400).json({ error: 'Debe seleccionar una sucursal activa antes de continuar.' });
  }
  next();
};

export { JWT_SECRET };
