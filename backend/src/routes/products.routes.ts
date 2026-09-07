import { Router, Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole, requireSucursal, AuthRequest } from '../middleware/auth';

const router = Router();

// Resuelve qué sucursalId usar para consultas de stock: por defecto la activa del usuario,
// pero ADMIN puede pedir otra puntual con ?sucursalId=
function resolveSucursalId(req: AuthRequest): number | null {
  const query = req.query.sucursalId;
  if (query && req.user?.role === 'ADMIN') return parseInt(query as string);
  return req.user?.sucursalId || null;
}

// Adjunta a cada producto: el stock de la sucursal activa (currentStock/minStock, lo que
// consume la tabla principal y la lógica de bajo mínimo), el desglose por sucursal
// (stockPorSucursal, solo sedes activas) y el total del negocio (totalStock).
// Todos los roles reciben el desglose: el vendedor lo usa para consultar en modo lectura
// si hay stock en el otro local. El nombre de la sucursal viaja en el payload porque un
// VENDEDOR no tiene la lista de sucursales ajenas en el frontend.
async function attachStock(products: any[], sucursalId: number | null) {
  const stocks = await prisma.productStock.findMany({
    where: { productId: { in: products.map((p) => p.id) } },
    include: { sucursal: { select: { id: true, nombre: true, activa: true } } },
  });

  return products.map((p) => {
    const rows = stocks
      .filter((s) => s.productId === p.id && s.sucursal.activa)
      .sort((a, b) => a.sucursal.nombre.localeCompare(b.sucursal.nombre));

    const totalStock = rows.reduce((sum, s) => sum + s.currentStock, 0);
    const stockPorSucursal = rows.map((s) => ({
      sucursalId: s.sucursalId,
      nombre: s.sucursal.nombre,
      currentStock: s.currentStock,
      minStock: s.minStock,
    }));

    if (!sucursalId) {
      // Sin sucursal activa (ej. ADMIN consultando catálogo sin elegir sucursal): la columna
      // principal muestra el consolidado.
      return { ...p, currentStock: totalStock, minStock: null, totalStock, stockPorSucursal };
    }

    const row = rows.find((s) => s.sucursalId === sucursalId);
    return {
      ...p,
      currentStock: row?.currentStock ?? 0,
      minStock: row?.minStock ?? 5,
      totalStock,
      stockPorSucursal,
    };
  });
}

// Crea (si no existen) los registros de ProductStock para un producto en todas las sucursales activas.
async function ensureStockRowsForAllSucursales(tx: any, productId: number, sucursalConStock?: { sucursalId: number; currentStock: number; minStock: number }) {
  const sucursales = await tx.sucursal.findMany({ where: { activa: true } });
  for (const sucursal of sucursales) {
    const isTarget = sucursalConStock && sucursal.id === sucursalConStock.sucursalId;
    await tx.productStock.upsert({
      where: { productId_sucursalId: { productId, sucursalId: sucursal.id } },
      update: {},
      create: {
        productId,
        sucursalId: sucursal.id,
        currentStock: isTarget ? sucursalConStock!.currentStock : 0,
        minStock: isTarget ? sucursalConStock!.minStock : 5,
      },
    });
  }
}

// GET /api/products (supports ?search=, ?categoryId=, ?active=, ?sucursalId= (solo ADMIN))
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { search, categoryId, active } = req.query;

    const where: any = {};
    if (active !== undefined) {
      where.active = active === 'true';
    } else {
      where.active = true;
    }

    if (categoryId) {
      where.categoryId = parseInt(categoryId as string);
    }

    if (search) {
      const query = (search as string).trim();
      where.OR = [
        { code: { contains: query } },
        { name: { contains: query } },
        { description: { contains: query } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const withStock = await attachStock(products, resolveSucursalId(req));
    return res.json(withStock);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/products/low-stock (por la sucursal activa; ADMIN puede pedir ?sucursalId= o ?all=true para consolidado)
router.get('/low-stock', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const consolidado = req.user?.role === 'ADMIN' && req.query.all === 'true';

    const stocks = await prisma.productStock.findMany({
      where: consolidado ? {} : { sucursalId: resolveSucursalId(req) || undefined },
      include: {
        product: { include: { category: { select: { name: true } }, supplier: { select: { name: true } } } },
        sucursal: { select: { id: true, nombre: true } },
      },
    });

    const lowStock = stocks
      .filter((s) => s.product.active && s.currentStock <= s.minStock)
      .map((s) => ({
        ...s.product,
        currentStock: s.currentStock,
        minStock: s.minStock,
        sucursal: s.sucursal,
      }));

    return res.json(lowStock);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/products/code/:code (Fast lookup for scanner)
router.get('/code/:code', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const code = req.params.code.trim();
    const product = await prisma.product.findUnique({
      where: { code },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado con el código escaneado.', code });
    }

    const [withStock] = await attachStock([product], resolveSucursalId(req));
    return res.json(withStock);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/products (Full product creation). El stock inicial se registra en la sucursal activa del usuario.
router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const {
      code,
      name,
      description,
      categoryId,
      unit,
      costPrice,
      profitMargin,
      salePrice,
      wholesalePrice,
      minStock,
      currentStock,
      supplierId,
      isVariant,
      parentId,
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'El código de barras y el nombre son requeridos.' });
    }

    const existing = await prisma.product.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un producto registrado con ese código de barras.' });
    }

    const calculatedSalePrice = salePrice || (costPrice ? costPrice * (1 + (profitMargin || 30) / 100) : 0);
    const initialStock = parseFloat(currentStock || 0);
    const resolvedMinStock = parseFloat(minStock || 5);
    const sucursalId = req.user!.sucursalId!;

    const newProduct = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.create({
        data: {
          code: code.trim(),
          name: name.trim(),
          description,
          categoryId: categoryId ? parseInt(categoryId) : null,
          unit: unit || 'UN',
          costPrice: parseFloat(costPrice || 0),
          profitMargin: parseFloat(profitMargin || 30),
          salePrice: parseFloat(calculatedSalePrice),
          wholesalePrice: parseFloat(wholesalePrice || calculatedSalePrice * 0.85),
          supplierId: supplierId ? parseInt(supplierId) : null,
          isVariant: Boolean(isVariant),
          parentId: parentId ? parseInt(parentId) : null,
        },
      });

      await ensureStockRowsForAllSucursales(tx, prod.id, {
        sucursalId,
        currentStock: initialStock,
        minStock: resolvedMinStock,
      });

      if (initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: prod.id,
            sucursalId,
            movementType: 'MANUAL_IN',
            quantity: initialStock,
            previousStock: 0,
            newStock: initialStock,
            reason: 'Stock inicial de alta de producto',
            userId: req.user!.id,
          },
        });
      }

      return prod;
    });

    return res.status(201).json(newProduct);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/products/quick-barcode (Fast barcode registration from POS)
router.post('/quick-barcode', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const { code, name, salePrice, currentStock, categoryId } = req.body;
    if (!code || !name || salePrice === undefined) {
      return res.status(400).json({ error: 'Código, nombre y precio de venta son requeridos.' });
    }

    const existing = await prisma.product.findUnique({ where: { code: code.trim() } });
    if (existing) {
      return res.status(400).json({ error: 'El producto ya existe.' });
    }

    const initialStock = parseFloat(currentStock || 1);
    const price = parseFloat(salePrice);
    const sucursalId = req.user!.sucursalId!;

    const product = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.create({
        data: {
          code: code.trim(),
          name: name.trim(),
          unit: 'UN',
          costPrice: price * 0.7,
          profitMargin: 30,
          salePrice: price,
          wholesalePrice: price * 0.85,
          categoryId: categoryId ? parseInt(categoryId) : null,
        },
      });

      await ensureStockRowsForAllSucursales(tx, prod.id, {
        sucursalId,
        currentStock: initialStock,
        minStock: 5,
      });

      await tx.stockMovement.create({
        data: {
          productId: prod.id,
          sucursalId,
          movementType: 'MANUAL_IN',
          quantity: initialStock,
          previousStock: 0,
          newStock: initialStock,
          reason: 'Alta rápida en POS por escaneo de código nuevo',
          userId: req.user!.id,
        },
      });

      return prod;
    });

    return res.status(201).json(product);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/products/:id (datos globales del catálogo, no toca stock)
router.put('/:id', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const {
      code,
      name,
      description,
      categoryId,
      unit,
      costPrice,
      profitMargin,
      salePrice,
      wholesalePrice,
      supplierId,
      active,
    } = req.body;

    const data: any = {};
    if (code !== undefined) data.code = code.trim();
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description;
    if (categoryId !== undefined) data.categoryId = categoryId ? parseInt(categoryId) : null;
    if (unit !== undefined) data.unit = unit;
    if (costPrice !== undefined) data.costPrice = parseFloat(costPrice);
    if (profitMargin !== undefined) data.profitMargin = parseFloat(profitMargin);
    if (salePrice !== undefined) data.salePrice = parseFloat(salePrice);
    if (wholesalePrice !== undefined) data.wholesalePrice = parseFloat(wholesalePrice);
    if (supplierId !== undefined) data.supplierId = supplierId ? parseInt(supplierId) : null;
    if (active !== undefined) data.active = Boolean(active);

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// PUT /api/products/:id/min-stock (umbral de stock mínimo, específico de la sucursal activa)
router.put('/:id/min-stock', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    const { minStock } = req.body;
    const sucursalId = req.user!.sucursalId!;

    const updated = await prisma.productStock.upsert({
      where: { productId_sucursalId: { productId, sucursalId } },
      update: { minStock: parseFloat(minStock) },
      create: { productId, sucursalId, minStock: parseFloat(minStock), currentStock: 0 },
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/products/:id/movement (Ajuste manual de stock en la sucursal activa)
router.post('/:id/movement', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), requireSucursal, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { type, quantity, reason } = req.body; // type: MANUAL_IN, MANUAL_OUT
    const sucursalId = req.user!.sucursalId!;

    if (!type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Tipo y cantidad válida son requeridos.' });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });

    const stockRow = await prisma.productStock.upsert({
      where: { productId_sucursalId: { productId: id, sucursalId } },
      update: {},
      create: { productId: id, sucursalId, currentStock: 0, minStock: 5 },
    });

    const qty = parseFloat(quantity);
    const previousStock = stockRow.currentStock;
    let newStock = previousStock;

    if (type === 'MANUAL_IN' || type === 'PURCHASE') {
      newStock = previousStock + qty;
    } else if (type === 'MANUAL_OUT' || type === 'SALE') {
      newStock = previousStock - qty;
    } else {
      return res.status(400).json({ error: 'Tipo de movimiento no válido.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedStock = await tx.productStock.update({
        where: { productId_sucursalId: { productId: id, sucursalId } },
        data: { currentStock: newStock },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: id,
          sucursalId,
          movementType: type,
          quantity: qty,
          previousStock,
          newStock,
          reason: reason || 'Ajuste manual de stock',
          userId: req.user!.id,
        },
      });

      return { stock: updatedStock, movement };
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/products/:id/transfer (Transferencia de stock entre sucursales) — ADMIN
router.post('/:id/transfer', authenticateToken, requireRole(['ADMIN']), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { fromSucursalId, toSucursalId, quantity, reason } = req.body;

    const from = parseInt(fromSucursalId);
    const to = parseInt(toSucursalId);
    const qty = parseFloat(quantity);

    if (!from || !to || from === to || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Debe indicar dos sucursales distintas y una cantidad válida.' });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });

    const result = await prisma.$transaction(async (tx) => {
      const originStock = await tx.productStock.upsert({
        where: { productId_sucursalId: { productId: id, sucursalId: from } },
        update: {},
        create: { productId: id, sucursalId: from, currentStock: 0, minStock: 5 },
      });

      if (originStock.currentStock < qty) {
        throw new Error(`Stock insuficiente en la sucursal de origen (disponible: ${originStock.currentStock}).`);
      }

      const destStock = await tx.productStock.upsert({
        where: { productId_sucursalId: { productId: id, sucursalId: to } },
        update: {},
        create: { productId: id, sucursalId: to, currentStock: 0, minStock: 5 },
      });

      const newOriginStock = originStock.currentStock - qty;
      const newDestStock = destStock.currentStock + qty;

      await tx.productStock.update({
        where: { productId_sucursalId: { productId: id, sucursalId: from } },
        data: { currentStock: newOriginStock },
      });
      await tx.productStock.update({
        where: { productId_sucursalId: { productId: id, sucursalId: to } },
        data: { currentStock: newDestStock },
      });

      const movementOut = await tx.stockMovement.create({
        data: {
          productId: id,
          sucursalId: from,
          sucursalDestinoId: to,
          movementType: 'TRANSFER_OUT',
          quantity: qty,
          previousStock: originStock.currentStock,
          newStock: newOriginStock,
          reason: reason || `Transferencia a sucursal #${to}`,
          userId: req.user!.id,
        },
      });

      const movementIn = await tx.stockMovement.create({
        data: {
          productId: id,
          sucursalId: to,
          sucursalDestinoId: from,
          movementType: 'TRANSFER_IN',
          quantity: qty,
          previousStock: destStock.currentStock,
          newStock: newDestStock,
          reason: reason || `Transferencia desde sucursal #${from}`,
          userId: req.user!.id,
        },
      });

      return { movementOut, movementIn };
    });

    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// GET /api/products/:id/movements (por sucursal activa; ADMIN puede pedir ?sucursalId= o ?all=true)
router.get('/:id/movements', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const consolidado = req.user?.role === 'ADMIN' && req.query.all === 'true';

    const movements = await prisma.stockMovement.findMany({
      where: consolidado ? { productId: id } : { productId: id, sucursalId: resolveSucursalId(req) || undefined },
      include: {
        user: { select: { name: true, username: true } },
        sucursal: { select: { nombre: true } },
        sucursalDestino: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json(movements);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
