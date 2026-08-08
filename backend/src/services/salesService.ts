import { prisma } from '../db/prisma';

// Errores de validación de negocio (carrito vacío, caja cerrada, pago mal formado, etc.):
// se distinguen de errores inesperados para que las rutas que llaman a createSale() puedan
// devolver 400 en vez de 500 sin tener que duplicar cada chequeo.
export class ValidationError extends Error {}

const CARD_TYPES = ['Visa', 'Mastercard', 'American Express', 'Cabal', 'Naranja', 'Otra'];

export interface CreateSaleParams {
  sucursalId: number;
  userId: number;
  customerId?: number | string | null;
  saleType?: string;
  items: { productId: number | string; quantity: number | string }[];
  payments: { paymentMethod: string; amount: number | string; reference?: string; cardType?: string; installments?: number | string }[];
  discountType?: string;
  discountValue?: number | string;
  budgetId?: number | null;
}

// Lógica de creación de una venta real: cobra, descuenta stock, registra caja y cuenta
// corriente. La usan tanto el checkout del POS (sales.routes.ts) como la conversión de un
// presupuesto en venta (budgets.routes.ts) — mismas reglas de negocio y de seguridad en
// los dos casos (el precio SIEMPRE se recalcula del catálogo del servidor, nunca se confía
// en lo que mande el cliente, ver nota más abajo).
export async function createSale(params: CreateSaleParams) {
  const { sucursalId, userId, customerId, saleType, items, payments, discountType, discountValue, budgetId } = params;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ValidationError('El carrito de ventas no puede estar vacío.');
  }
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    throw new ValidationError('Debe especificar al menos un medio de pago.');
  }

  const activeSession = await prisma.cashSession.findFirst({ where: { status: 'OPEN', sucursalId } });
  if (!activeSession) {
    throw new ValidationError('No se puede registrar ventas sin una caja abierta en esta sucursal. Abra la caja primero.');
  }

  let subtotal = 0;
  const formattedItems: {
    productId: number;
    productCode: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[] = [];

  for (const item of items) {
    const product = await prisma.product.findUnique({ where: { id: parseInt(item.productId as string) } });
    if (!product || !product.active) {
      throw new ValidationError(`Producto no válido o inactivo ID ${item.productId}`);
    }

    const qty = parseFloat(item.quantity as string);
    if (qty <= 0) {
      throw new ValidationError(`Cantidad inválida para producto ${product.name}`);
    }

    // El precio SIEMPRE se toma del catálogo del servidor según el tipo de venta, nunca de
    // lo que mande el cliente (ver commit de seguridad original): esto aplica igual cuando
    // el origen es un presupuesto — el precio cotizado ahí no se hereda ciegamente, se
    // vuelve a resolver acá para no reabrir esa misma vulnerabilidad por otra puerta.
    const unitPrice = saleType === 'WHOLESALE' ? product.wholesalePrice : product.salePrice;
    const itemSubtotal = qty * unitPrice;
    subtotal += itemSubtotal;

    formattedItems.push({
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity: qty,
      unitPrice,
      subtotal: itemSubtotal,
    });
  }

  const resolvedDiscountType = discountType === 'PERCENTAGE' ? 'PERCENTAGE' : 'AMOUNT';
  const rawDiscountValue = parseFloat((discountValue as any) || 0);
  if (isNaN(rawDiscountValue) || rawDiscountValue < 0) {
    throw new ValidationError('El descuento ingresado no es válido.');
  }
  if (resolvedDiscountType === 'PERCENTAGE' && rawDiscountValue > 100) {
    throw new ValidationError('El descuento por porcentaje no puede superar el 100%.');
  }

  const discountAmount = resolvedDiscountType === 'PERCENTAGE'
    ? Math.round(subtotal * (rawDiscountValue / 100) * 100) / 100
    : rawDiscountValue;

  if (discountAmount < 0 || discountAmount > subtotal) {
    throw new ValidationError('El descuento debe ser un monto válido entre $0 y el subtotal de la venta.');
  }
  const total = subtotal - discountAmount;

  const paymentSum = payments.reduce((acc, p) => acc + parseFloat(p.amount as string), 0);
  if (Math.abs(paymentSum - total) > 0.05) {
    throw new ValidationError(`El total de pagos ($${paymentSum.toFixed(2)}) no coincide con el total de la venta ($${total.toFixed(2)}).`);
  }

  for (const p of payments) {
    if (p.paymentMethod === 'CREDIT' || p.paymentMethod === 'DEBIT') {
      if (p.cardType && !CARD_TYPES.includes(p.cardType)) {
        throw new ValidationError(`Tipo de tarjeta inválido: ${p.cardType}`);
      }
    }
    if (p.paymentMethod === 'CREDIT' && p.installments !== undefined && p.installments !== null && p.installments !== '') {
      const inst = parseInt(p.installments as string);
      if (isNaN(inst) || inst < 1 || inst > 24) {
        throw new ValidationError('La cantidad de cuotas debe ser un número entre 1 y 24.');
      }
    }
  }

  const count = await prisma.sale.count();
  const saleNumber = `VTA-${(count + 1).toString().padStart(8, '0')}`;

  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        saleNumber,
        sucursalId,
        sessionId: activeSession.id,
        customerId: customerId ? parseInt(customerId as string) : null,
        saleType: saleType || 'RETAIL',
        subtotal,
        discountType: resolvedDiscountType,
        discountValue: rawDiscountValue,
        discount: discountAmount,
        total,
        status: 'COMPLETED',
        userId,
        items: { create: formattedItems },
        payments: {
          create: payments.map((p) => ({
            paymentMethod: p.paymentMethod,
            amount: parseFloat(p.amount as string),
            reference: p.reference || null,
            cardType: (p.paymentMethod === 'CREDIT' || p.paymentMethod === 'DEBIT') && p.cardType ? p.cardType : null,
            installments: p.paymentMethod === 'CREDIT' && p.installments ? parseInt(p.installments as string) : null,
          })),
        },
      },
      include: { items: true, payments: true, customer: true },
    });

    for (const item of formattedItems) {
      const stockRow = await tx.productStock.upsert({
        where: { productId_sucursalId: { productId: item.productId, sucursalId } },
        update: {},
        create: { productId: item.productId, sucursalId, currentStock: 0, minStock: 5 },
      });

      const newStock = stockRow.currentStock - item.quantity;
      await tx.productStock.update({
        where: { productId_sucursalId: { productId: item.productId, sucursalId } },
        data: { currentStock: newStock },
      });

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          sucursalId,
          movementType: 'SALE',
          quantity: item.quantity,
          previousStock: stockRow.currentStock,
          newStock,
          reason: budgetId ? `Venta #${sale.saleNumber} (desde presupuesto #${budgetId})` : `Venta #${sale.saleNumber}`,
          userId,
        },
      });
    }

    for (const p of payments) {
      const pAmount = parseFloat(p.amount as string);
      const pMethod = p.paymentMethod;

      if (pMethod === 'CURRENT_ACCOUNT') {
        if (!customerId) {
          throw new ValidationError('Para cobrar a Cuenta Corriente debe seleccionar un cliente.');
        }

        const customer = await tx.customer.findUnique({ where: { id: parseInt(customerId as string) } });
        if (!customer) throw new ValidationError('Cliente no encontrado.');

        const newCustomerBalance = customer.balance + pAmount;
        await tx.customer.update({
          where: { id: customer.id },
          data: { balance: newCustomerBalance },
        });

        await tx.customerAccountMovement.create({
          data: {
            customerId: customer.id,
            saleId: sale.id,
            type: 'CHARGE_DEBT',
            amount: pAmount,
            balanceAfter: newCustomerBalance,
            paymentMethod: 'CURRENT_ACCOUNT',
            notes: `Cargo por venta #${sale.saleNumber}`,
          },
        });
      }

      await tx.cashMovement.create({
        data: {
          sessionId: activeSession.id,
          type: 'SALE',
          paymentMethod: pMethod,
          amount: pAmount,
          notes: `Venta #${sale.saleNumber}`,
          userId,
        },
      });
    }

    return sale;
  });
}
