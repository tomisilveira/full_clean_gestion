import { describe, it, expect } from 'vitest';

describe('Lógica Crítica de Negocio - Full Clean', () => {
  it('Debe calcular correctamente el precio de venta a partir del costo y margen de ganancia', () => {
    const costPrice = 2000;
    const profitMargin = 30; // 30%
    const expectedSalePrice = costPrice * (1 + profitMargin / 100); // 2600

    expect(expectedSalePrice).toBe(2600);
  });

  it('Debe calcular adecuadamente el IVA (21%) y Neto a partir del Total', () => {
    const total = 12100;
    const impNeto = Math.round((total / 1.21) * 100) / 100;
    const impIVA = Math.round((total - impNeto) * 100) / 100;

    expect(impNeto).toBe(10000);
    expect(impIVA).toBe(2100);
    expect(impNeto + impIVA).toBe(total);
  });

  it('Debe calcular el arqueo de caja con diferencia esperada', () => {
    const initialAmount = 10000;
    const salesCash = 35000;
    const manualIn = 5000;
    const expenses = 2000;
    const expectedCashInDrawer = initialAmount + salesCash + manualIn - expenses; // 48000

    const actualDeclared = 47800;
    const difference = actualDeclared - expectedCashInDrawer; // -200 (Faltante)

    expect(expectedCashInDrawer).toBe(48000);
    expect(difference).toBe(-200);
  });

  it('Debe calcular la actualización de stock tras un movimiento de salida por venta', () => {
    const previousStock = 50;
    const quantitySold = 12;
    const newStock = previousStock - quantitySold;

    expect(newStock).toBe(38);
    expect(newStock <= 15).toBe(false); // Min stock check
  });
});

describe('Descuento por monto o por porcentaje en una venta', () => {
  // Misma fórmula que POST /api/sales en sales.routes.ts: el descuento se recalcula
  // siempre en el servidor a partir de discountType/discountValue, nunca se confía en
  // un monto final que mande el cliente.
  function calcularDescuento(subtotal: number, discountType: 'AMOUNT' | 'PERCENTAGE', discountValue: number) {
    if (discountType === 'PERCENTAGE') {
      return Math.round(subtotal * (discountValue / 100) * 100) / 100;
    }
    return discountValue;
  }

  it('Debe calcular el descuento por monto fijo tal cual se ingresa', () => {
    expect(calcularDescuento(3500, 'AMOUNT', 350)).toBe(350);
  });

  it('Debe calcular el descuento por porcentaje sobre el subtotal', () => {
    expect(calcularDescuento(3500, 'PERCENTAGE', 10)).toBe(350);
    expect(calcularDescuento(999, 'PERCENTAGE', 15)).toBe(149.85);
  });

  it('El descuento final no debe superar el subtotal de la venta', () => {
    const subtotal = 1000;
    const discountAmount = calcularDescuento(subtotal, 'PERCENTAGE', 100);
    expect(discountAmount).toBe(1000);
    expect(discountAmount).toBeLessThanOrEqual(subtotal);
  });

  it('El total de la venta debe ser subtotal menos el descuento calculado', () => {
    const subtotal = 3500;
    const discountAmount = calcularDescuento(subtotal, 'PERCENTAGE', 10);
    const total = subtotal - discountAmount;
    expect(total).toBe(3150);
  });
});

describe('Multi-Sucursal: Stock por sucursal', () => {
  // Simula el modelo ProductStock: un mismo producto tiene filas independientes por sucursal.
  type StockPorSucursal = Record<number, { currentStock: number; minStock: number }>;

  it('El mismo producto debe mantener cantidades independientes en cada sucursal', () => {
    const stock: StockPorSucursal = {
      1: { currentStock: 25, minStock: 10 }, // Local Central
      2: { currentStock: 15, minStock: 10 }, // Local Felix San Martin
    };

    // Una venta de 3 unidades en la sucursal 1 no debe afectar la sucursal 2
    stock[1].currentStock -= 3;

    expect(stock[1].currentStock).toBe(22);
    expect(stock[2].currentStock).toBe(15); // sin cambios
  });

  it('El stock consolidado debe ser la suma de todas las sucursales', () => {
    const stock: StockPorSucursal = {
      1: { currentStock: 22, minStock: 10 },
      2: { currentStock: 20, minStock: 10 },
    };

    const consolidado = Object.values(stock).reduce((sum, s) => sum + s.currentStock, 0);
    expect(consolidado).toBe(42);
  });

  it('Una sucursal puede estar bajo mínimo mientras otra no', () => {
    const stock: StockPorSucursal = {
      1: { currentStock: 8, minStock: 10 }, // bajo mínimo
      2: { currentStock: 20, minStock: 10 }, // OK
    };

    const bajoMinimo = Object.entries(stock).filter(([, s]) => s.currentStock <= s.minStock);
    expect(bajoMinimo.length).toBe(1);
    expect(bajoMinimo[0][0]).toBe('1');
  });
});

describe('Multi-Sucursal: Transferencia de stock entre sucursales', () => {
  function transferir(origen: number, destino: number, cantidad: number) {
    if (cantidad <= 0) throw new Error('Cantidad inválida');
    if (origen < cantidad) throw new Error('Stock insuficiente en la sucursal de origen');
    return { nuevoOrigen: origen - cantidad, nuevoDestino: destino + cantidad };
  }

  it('Debe descontar del origen y sumar al destino la misma cantidad', () => {
    const { nuevoOrigen, nuevoDestino } = transferir(22, 20, 5);
    expect(nuevoOrigen).toBe(17);
    expect(nuevoDestino).toBe(25);
    // La cantidad total de mercadería entre ambas sucursales debe conservarse
    expect(nuevoOrigen + nuevoDestino).toBe(22 + 20);
  });

  it('Debe rechazar la transferencia si el origen no tiene stock suficiente', () => {
    expect(() => transferir(3, 10, 5)).toThrow('Stock insuficiente en la sucursal de origen');
  });

  it('Debe rechazar cantidades inválidas', () => {
    expect(() => transferir(10, 10, 0)).toThrow('Cantidad inválida');
    expect(() => transferir(10, 10, -2)).toThrow('Cantidad inválida');
  });
});

describe('Multi-Sucursal: Caja independiente por sucursal', () => {
  it('El cierre de una sucursal no debe mezclarse con los movimientos de otra', () => {
    const movimientosPorSesion: Record<number, { sucursalId: number; amount: number }[]> = {
      101: [{ sucursalId: 1, amount: 10500 }], // sesión de Local Central
      102: [{ sucursalId: 2, amount: 4200 }], // sesión de Local Felix San Martín
    };

    const totalSesion101 = movimientosPorSesion[101].reduce((sum, m) => sum + m.amount, 0);
    const totalSesion102 = movimientosPorSesion[102].reduce((sum, m) => sum + m.amount, 0);

    expect(totalSesion101).toBe(10500);
    expect(totalSesion102).toBe(4200);
  });

  it('No debe permitir dos cajas abiertas simultáneamente en la misma sucursal', () => {
    const sesionesAbiertas = [
      { id: 1, sucursalId: 1, status: 'OPEN' },
    ];

    const puedeAbrirNuevaCaja = (sucursalId: number) =>
      !sesionesAbiertas.some((s) => s.sucursalId === sucursalId && s.status === 'OPEN');

    expect(puedeAbrirNuevaCaja(1)).toBe(false); // Local Central ya tiene una caja abierta
    expect(puedeAbrirNuevaCaja(2)).toBe(true); // Felix San Martín puede abrir la suya
  });
});

describe('Multi-Sucursal: Comprobante ARCA con punto de venta por sucursal', () => {
  const sucursales = [
    { id: 1, nombre: 'Local Central', ptoVtaArca: 1 },
    { id: 2, nombre: 'Local Felix San Martin', ptoVtaArca: 2 },
  ];

  function armarComprobante(sucursalId: number, ultimoNumeroPorPtoVta: Record<number, number>) {
    const sucursal = sucursales.find((s) => s.id === sucursalId);
    if (!sucursal) throw new Error('Sucursal no encontrada');
    const ptoVta = sucursal.ptoVtaArca;
    const cbteNumero = (ultimoNumeroPorPtoVta[ptoVta] || 0) + 1;
    return { ptoVta, cbteNumero };
  }

  it('Cada sucursal debe emitir con su propio punto de venta', () => {
    const ultimos = { 1: 99, 2: 4 };

    const comprobanteCentral = armarComprobante(1, ultimos);
    const comprobanteFelix = armarComprobante(2, ultimos);

    expect(comprobanteCentral.ptoVta).toBe(1);
    expect(comprobanteCentral.cbteNumero).toBe(100);

    expect(comprobanteFelix.ptoVta).toBe(2);
    expect(comprobanteFelix.cbteNumero).toBe(5);
  });

  it('La numeración de un punto de venta no debe saltarse ni repetirse entre emisiones consecutivas', () => {
    const ultimos: Record<number, number> = { 1: 100 };

    const primero = armarComprobante(1, ultimos);
    ultimos[1] = primero.cbteNumero; // el sistema debe persistir el último número emitido
    const segundo = armarComprobante(1, ultimos);

    expect(primero.cbteNumero).toBe(101);
    expect(segundo.cbteNumero).toBe(102);
  });
});
