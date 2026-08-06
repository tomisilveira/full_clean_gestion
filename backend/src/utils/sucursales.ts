import { prisma } from '../db/prisma';

// Devuelve las sucursales a las que un usuario tiene acceso.
// ADMIN: todas las sucursales activas. VENDEDOR / SOLO_CONSULTA: solo las asignadas vía UserSucursal.
export async function getSucursalesForUser(userId: number, role: string) {
  if (role === 'ADMIN') {
    return prisma.sucursal.findMany({
      where: { activa: true },
      orderBy: { nombre: 'asc' },
    });
  }

  const asignadas = await prisma.userSucursal.findMany({
    where: { userId },
    include: { sucursal: true },
  });

  return asignadas
    .map((a) => a.sucursal)
    .filter((s) => s.activa)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Valida que un usuario pueda operar en una sucursal determinada (usado al seleccionar sucursal activa).
export async function userCanAccessSucursal(userId: number, role: string, sucursalId: number): Promise<boolean> {
  if (role === 'ADMIN') {
    const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
    return !!sucursal && sucursal.activa;
  }

  const link = await prisma.userSucursal.findUnique({
    where: { userId_sucursalId: { userId, sucursalId } },
  });
  return !!link;
}
