import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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

// En producción es obligatorio definir JWT_SECRET por variable de entorno: el valor por
// defecto es público (está en este repo), así que usarlo en producción permitiría a
// cualquiera forjar tokens válidos (incluso de ADMIN) sin conocer ninguna contraseña.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está configurado. Es obligatorio definirlo en producción (variable de entorno).');
}
const JWT_SECRET = process.env.JWT_SECRET || 'full_clean_super_secret_jwt_key_2026';

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado: Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
    req.user = decoded as AuthRequest['user'];
    next();
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
