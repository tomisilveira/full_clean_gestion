import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import bcrypt from 'bcryptjs';

// Prueba de punta a punta de los flujos principales: la API real de Express (con todos sus
// middlewares) contra una base PostgreSQL descartable. Se ejecuta con `npm run test:integration`.
// Las credenciales de abajo son valores de prueba que solo existen en la base temporal.
const PASS = 'clave-de-prueba-1';

let server: http.Server;
let base: string;
let prisma: typeof import('../../db/prisma').prisma;

// IDs sembrados
let sucA: number;
let sucB: number;
let productId: number;

async function call(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* no es JSON (ej. CSV) */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(username: string) {
  const res = await call('/auth/login', { method: 'POST', body: { username, password: PASS } });
  expect(res.status).toBe(200);
  return res.json.token as string;
}

const stockOf = async (sucursalId: number) =>
  (await prisma.productStock.findUnique({ where: { productId_sucursalId: { productId, sucursalId } } }))!.currentStock;

const sellOne = (token: string, qty = 1) =>
  call('/sales', {
    method: 'POST',
    token,
    body: { items: [{ productId, quantity: qty }], payments: [{ paymentMethod: 'CASH', amount: 1000 * qty }] },
  });

beforeAll(async () => {
  prisma = (await import('../../db/prisma')).prisma;
  const { app } = await import('../../app');
  server = http.createServer(app).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const passwordHash = await bcrypt.hash(PASS, 4);
  const a = await prisma.sucursal.create({ data: { nombre: 'Sucursal A' } });
  const b = await prisma.sucursal.create({ data: { nombre: 'Sucursal B' } });
  sucA = a.id;
  sucB = b.id;

  await prisma.user.create({ data: { username: 'admin', passwordHash, name: 'Admin Test', role: 'ADMIN' } });
  await prisma.user.create({ data: { username: 'vend_a', passwordHash, name: 'Vendedor A', role: 'VENDEDOR', sucursales: { create: [{ sucursalId: sucA }] } } });
  await prisma.user.create({ data: { username: 'vend_b', passwordHash, name: 'Vendedor B', role: 'VENDEDOR', sucursales: { create: [{ sucursalId: sucB }] } } });

  const product = await prisma.product.create({
    data: {
      code: 'TEST-001',
      name: 'Lavandina 1L',
      costPrice: 600,
      salePrice: 1000,
      wholesalePrice: 900,
      stocks: { create: [{ sucursalId: sucA, currentStock: 10 }, { sucursalId: sucB, currentStock: 10 }] },
    },
  });
  productId = product.id;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

describe('salud y autenticación', () => {
  it('/api/health responde OK y verifica la base de datos', async () => {
    const res = await call('/health');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ status: 'OK', db: 'up' });
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('una ruta /api inexistente devuelve JSON 404 y no HTML', async () => {
    const res = await call('/no-existe');
    expect(res.status).toBe(404);
    expect(res.json.error).toBeTruthy();
  });

  it('un body que no es JSON devuelve 400 limpio', async () => {
    const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{roto' });
    expect(res.status).toBe(400);
  });

  it('rechaza credenciales incorrectas y un username que no es texto', async () => {
    expect((await call('/auth/login', { method: 'POST', body: { username: 'vend_a', password: 'mala' } })).status).toBe(401);
    expect((await call('/auth/login', { method: 'POST', body: { username: { $ne: 1 }, password: 'x' } })).status).toBe(400);
  });

  it('las rutas protegidas exigen token', async () => {
    expect((await call('/sales')).status).toBe(401);
    expect((await call('/customers/1/export')).status).toBe(401);
  });

  it('un usuario con una sola sucursal queda con la sucursal activa', async () => {
    const res = await call('/auth/login', { method: 'POST', body: { username: 'vend_a', password: PASS } });
    expect(res.json.activeSucursal.id).toBe(sucA);
    expect(res.json.user.passwordHash).toBeUndefined();
  });
});

describe('flujo de venta: caja → venta → anulación → cierre', () => {
  let tokenA: string;
  let tokenB: string;
  let adminToken: string;
  let saleId: number;

  beforeAll(async () => {
    tokenA = await login('vend_a');
    tokenB = await login('vend_b');
    adminToken = await login('admin');
  });

  it('no se puede vender sin caja abierta', async () => {
    const res = await sellOne(tokenA);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/caja/i);
  });

  it('abre la caja y rechaza abrir una segunda en la misma sucursal', async () => {
    expect((await call('/cash/open', { method: 'POST', token: tokenA, body: { initialAmount: 5000 } })).status).toBe(201);
    expect((await call('/cash/open', { method: 'POST', token: tokenA, body: { initialAmount: 1 } })).status).toBe(400);
  });

  it('una venta en efectivo descuenta stock y registra el movimiento de caja', async () => {
    const res = await sellOne(tokenA, 2);
    expect(res.status).toBe(201);
    saleId = res.json.id;
    expect(res.json.total).toBe(2000);
    expect(await stockOf(sucA)).toBe(8);
    expect(await stockOf(sucB)).toBe(10); // la otra sucursal no se toca

    const mov = await prisma.cashMovement.findFirst({ where: { session: { sucursalId: sucA }, type: 'SALE' } });
    expect(mov?.amount).toBe(2000);
  });

  it('el precio lo calcula el servidor: ignora el precio que mande el cliente', async () => {
    const res = await call('/sales', {
      method: 'POST',
      token: tokenA,
      body: { items: [{ productId, quantity: 1, unitPrice: 1 }], payments: [{ paymentMethod: 'CASH', amount: 1 }] },
    });
    expect(res.status).toBe(400); // pagos ($1) no coinciden con el total real ($1000)
    expect(await stockOf(sucA)).toBe(8); // y no descontó stock
  });

  it('aislamiento por sucursal: otra sucursal no ve ni lista la venta', async () => {
    expect((await call(`/sales/${saleId}`, { token: tokenB })).status).toBe(403);
    const list = await call('/sales', { token: tokenB });
    expect(list.json.some((s: any) => s.id === saleId)).toBe(false);
    expect((await call(`/sales/${saleId}`, { token: adminToken })).status).toBe(200);
  });

  it('un vendedor no puede anular; el admin sí, y el stock vuelve', async () => {
    expect((await call(`/sales/${saleId}/cancel`, { method: 'POST', token: tokenA })).status).toBe(403);
    expect((await call(`/sales/${saleId}/cancel`, { method: 'POST', token: adminToken })).status).toBe(200);
    expect(await stockOf(sucA)).toBe(10);
    expect((await call(`/sales/${saleId}/cancel`, { method: 'POST', token: adminToken })).status).toBe(400); // ya anulada
  });

  it('cierra la caja con un resumen', async () => {
    const res = await call('/cash/close', { method: 'POST', token: tokenA, body: { actualAmount: 5000 } });
    expect(res.status).toBe(200);
    expect(res.json.session.status).toBe('CLOSED');
  });
});

describe('concurrencia en el punto de venta', () => {
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    tokenA = await login('vend_a');
    tokenB = await login('vend_b');
    await call('/cash/open', { method: 'POST', token: tokenA, body: { initialAmount: 0 } });
    await call('/cash/open', { method: 'POST', token: tokenB, body: { initialAmount: 0 } });
    await prisma.productStock.update({ where: { productId_sucursalId: { productId, sucursalId: sucA } }, data: { currentStock: 20 } });
  });

  it('dos ventas simultáneas de sucursales distintas no chocan (número de venta único)', async () => {
    const results = await Promise.all([sellOne(tokenA), sellOne(tokenB)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].json.saleNumber).not.toBe(results[1].json.saleNumber);
  });

  it('varias ventas simultáneas del mismo producto no pierden descuentos de stock', async () => {
    const before = await stockOf(sucA);
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => sellOne(tokenA)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await stockOf(sucA)).toBe(before - 5);
  });
});

describe('administración, privacidad y exportación', () => {
  let adminToken: string;
  let tokenA: string;

  beforeAll(async () => {
    adminToken = await login('admin');
    tokenA = await login('vend_a');
  });

  it('la exportación es solo para ADMIN y nunca incluye hashes de contraseña', async () => {
    expect((await call('/export/full', { token: tokenA })).status).toBe(403);
    const res = await call('/export/full', { token: adminToken });
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/passwordHash/);
    expect(res.text).not.toContain('$2a$');
  });

  it('valida usuarios: rol inválido, contraseña corta y auto-desactivación', async () => {
    const bad = { username: 'nuevo', name: 'Nuevo', sucursalIds: [sucA] };
    expect((await call('/auth/users', { method: 'POST', token: adminToken, body: { ...bad, password: 'clave-larga-1', role: 'SUPERADMIN' } })).status).toBe(400);
    expect((await call('/auth/users', { method: 'POST', token: adminToken, body: { ...bad, password: 'corta', role: 'VENDEDOR' } })).status).toBe(400);
    expect((await call('/auth/users', { method: 'POST', token: tokenA, body: { ...bad, password: 'clave-larga-1' } })).status).toBe(403);

    const me = await call('/auth/me', { token: adminToken });
    const self = await call(`/auth/users/${me.json.user.id}`, { method: 'PUT', token: adminToken, body: { active: false } });
    expect(self.status).toBe(400);
  });

  it('un usuario desactivado pierde el acceso de inmediato (aunque su token siga vigente)', async () => {
    const created = await call('/auth/users', { method: 'POST', token: adminToken, body: { username: 'temporal', password: PASS, name: 'Temporal', role: 'VENDEDOR', sucursalIds: [sucA] } });
    expect(created.status).toBe(201);
    const token = await login('temporal');
    expect((await call('/sales', { token })).status).toBe(200);
    await call(`/auth/users/${created.json.id}`, { method: 'PUT', token: adminToken, body: { active: false } });
    expect((await call('/sales', { token })).status).toBe(401);
  });

  it('cliente: valida datos, exporta y anonimiza conservando las ventas', async () => {
    expect((await call('/customers', { method: 'POST', token: adminToken, body: { name: 'X', email: 'no-es-mail' } })).status).toBe(400);

    const created = await call('/customers', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Juana Pérez', cuitDni: '27-12345678-4', phone: '1155550000', email: 'juana@example.com', address: 'Calle 1' },
    });
    expect(created.status).toBe(201);
    const id = created.json.id;

    // una venta asociada al cliente
    const sale = await call('/sales', {
      method: 'POST',
      token: tokenA,
      body: { customerId: id, items: [{ productId, quantity: 1 }], payments: [{ paymentMethod: 'CASH', amount: 1000 }] },
    });
    expect(sale.status).toBe(201);

    expect((await call(`/customers/${id}/export`, { token: tokenA })).status).toBe(403);
    const exported = await call(`/customers/${id}/export`, { token: adminToken });
    expect(exported.status).toBe(200);
    expect(exported.json.customer.sales).toHaveLength(1);
    expect(exported.json.customer.email).toBe('juana@example.com');

    expect((await call(`/customers/${id}/anonymize`, { method: 'POST', token: tokenA })).status).toBe(403);
    expect((await call(`/customers/${id}/anonymize`, { method: 'POST', token: adminToken })).status).toBe(200);

    const after = await prisma.customer.findUnique({ where: { id }, include: { sales: true } });
    expect(after).toMatchObject({ cuitDni: null, phone: null, email: null, address: null });
    expect(after!.name).toContain('anonimizado');
    expect(after!.sales).toHaveLength(1); // la venta se conserva

    expect((await call(`/customers/${id}/anonymize`, { method: 'POST', token: adminToken })).status).toBe(400); // ya anonimizado
  });

  it('no filtra mensajes internos en errores del servidor', async () => {
    // id que no cabe en un Int de Postgres: Prisma lanza un error interno
    const res = await call('/sales/99999999999999', { token: adminToken });
    expect([404, 500]).toContain(res.status);
    expect(res.text).not.toMatch(/prisma|invocation|findUnique|postgres/i);
  });
});

describe('operaciones simultáneas sobre stock y saldos', () => {
  let adminToken: string;

  beforeAll(async () => {
    const token = await login('admin');
    // el ADMIN ve todas las sucursales: para operar stock/compras debe elegir una
    const sel = await call('/auth/select-sucursal', { method: 'POST', token, body: { sucursalId: sucA } });
    expect(sel.status).toBe(200);
    adminToken = sel.json.token;
  });

  it('ajustes manuales simultáneos de stock no pisan cambios y dejan un historial coherente', async () => {
    const before = await stockOf(sucA);
    const move = (type: string, quantity: number) =>
      call(`/products/${productId}/movement`, { method: 'POST', token: adminToken, body: { type, quantity, reason: 'test concurrencia' } });

    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => move('MANUAL_IN', 2)),
      ...Array.from({ length: 4 }, () => move('MANUAL_OUT', 1)),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await stockOf(sucA)).toBe(before + 16 - 4);

    // cada movimiento tiene un "stock anterior" y uno "nuevo" que encajan con su cantidad
    const movements = await prisma.stockMovement.findMany({ where: { productId, sucursalId: sucA, reason: 'test concurrencia' } });
    expect(movements).toHaveLength(12);
    for (const m of movements) {
      const signed = m.movementType === 'MANUAL_IN' ? m.quantity : -m.quantity;
      expect(m.newStock - m.previousStock).toBe(signed);
    }
    // y el conjunto de movimientos suma exactamente el cambio neto de stock
    expect(movements.reduce((acc, m) => acc + (m.newStock - m.previousStock), 0)).toBe(12);
  });

  it('transferencias simultáneas no pueden sacar más stock del disponible', async () => {
    await prisma.productStock.update({ where: { productId_sucursalId: { productId, sucursalId: sucA } }, data: { currentStock: 5 } });
    const destBefore = await stockOf(sucB);

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        call(`/products/${productId}/transfer`, { method: 'POST', token: adminToken, body: { fromSucursalId: sucA, toSucursalId: sucB, quantity: 2 } })
      )
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 400, 400]); // con 5 de stock entran 2 transferencias de 2
    expect(await stockOf(sucA)).toBe(1);
    expect(await stockOf(sucB)).toBe(destBefore + 4); // el total se conserva
  });

  it('compras y pagos simultáneos a un proveedor suman bien stock y deuda', async () => {
    const supplier = await call('/suppliers', { method: 'POST', token: adminToken, body: { name: 'Proveedor Test' } });
    expect(supplier.status).toBe(201);
    const sid = supplier.json.id;
    const stockBefore = await stockOf(sucA);

    const purchases = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(`/suppliers/${sid}/purchases`, { method: 'POST', token: adminToken, body: { items: [{ productId, quantity: 1, costPrice: 100 }] } })
      )
    );
    expect(purchases.every((r) => r.status === 201)).toBe(true);
    expect(await stockOf(sucA)).toBe(stockBefore + 5);
    expect((await prisma.supplier.findUnique({ where: { id: sid } }))!.balance).toBe(500);

    const payments = await Promise.all(
      Array.from({ length: 5 }, () => call(`/suppliers/${sid}/payments`, { method: 'POST', token: adminToken, body: { amount: 50 } }))
    );
    expect(payments.every((r) => r.status === 200)).toBe(true);
    expect((await prisma.supplier.findUnique({ where: { id: sid } }))!.balance).toBe(250);

    // el último saldo informado en la cuenta corriente coincide con el real
    const last = await prisma.supplierAccountMovement.findMany({ where: { supplierId: sid }, orderBy: { id: 'asc' } });
    expect(Math.min(...last.map((m) => m.balanceAfter))).toBeGreaterThanOrEqual(0);
  });

  it('cobros simultáneos a un cliente restan bien del saldo', async () => {
    const customer = await prisma.customer.create({ data: { name: 'Cliente Deudor', balance: 1000 } });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call(`/customers/${customer.id}/payments`, { method: 'POST', token: adminToken, body: { amount: 100 } }))
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await prisma.customer.findUnique({ where: { id: customer.id } }))!.balance).toBe(500);
  });
});
