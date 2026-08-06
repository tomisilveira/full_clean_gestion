import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando carga de datos iniciales (Seed)...');

  // 1. Configuración de la Empresa (global, no por sucursal)
  await prisma.companyConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      businessName: 'Artículos de Limpieza Full Clean',
      cuit: '20-40000000-9',
      ivaCondition: 'Responsable Inscripto',
      address: 'Av. Corrientes 1234, CABA, Argentina',
      phone: '011 4444-5555',
      email: 'contacto@fullclean.com.ar',
      arcaHomo: true,
    },
  });

  // 2. Sucursales
  const sucursalCentral = await prisma.sucursal.upsert({
    where: { nombre: 'Local Central' },
    update: {},
    create: {
      nombre: 'Local Central',
      direccion: 'Av. Corrientes 1234, CABA',
      ptoVtaArca: 1,
      ticketWidth: 80,
      printerInterface: 'NONE',
    },
  });

  const sucursalFelixSanMartin = await prisma.sucursal.upsert({
    where: { nombre: 'Local Felix San Martin' },
    update: {},
    create: {
      nombre: 'Local Felix San Martin',
      direccion: 'Félix de San Martín, Argentina',
      ptoVtaArca: 2,
      ticketWidth: 80,
      printerInterface: 'NONE',
    },
  });

  // 3. Usuarios Iniciales
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const vendedorPasswordHash = await bcrypt.hash('vendedor123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      name: 'Administrador Principal',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
    },
  });

  const vendedor = await prisma.user.upsert({
    where: { username: 'vendedor' },
    update: {},
    create: {
      username: 'vendedor',
      name: 'Vendedor Mostrador',
      passwordHash: vendedorPasswordHash,
      role: 'VENDEDOR',
    },
  });

  // Admin no necesita asociación explícita (ve todas las sucursales),
  // pero se la asignamos igual para que aparezca en listados de "sucursales asignadas".
  for (const sucursalId of [sucursalCentral.id, sucursalFelixSanMartin.id]) {
    await prisma.userSucursal.upsert({
      where: { userId_sucursalId: { userId: admin.id, sucursalId } },
      update: {},
      create: { userId: admin.id, sucursalId },
    });
  }

  // El vendedor demo queda asignado solo al Local Central
  await prisma.userSucursal.upsert({
    where: { userId_sucursalId: { userId: vendedor.id, sucursalId: sucursalCentral.id } },
    update: {},
    create: { userId: vendedor.id, sucursalId: sucursalCentral.id },
  });

  // 4. Cliente Consumidor Final
  await prisma.customer.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Consumidor Final',
      ivaCondition: 'Consumidor Final',
      priceList: 'RETAIL',
    },
  });

  // 5. Categorías de Ejemplo
  const catDetergentes = await prisma.category.upsert({
    where: { name: 'Detergentes y Desengrasantes' },
    update: {},
    create: { name: 'Detergentes y Desengrasantes', description: 'Detergentes concentrados, vajilla y antigrasa' },
  });

  const catDesinfectantes = await prisma.category.upsert({
    where: { name: 'Lavandinas y Desinfectantes' },
    update: {},
    create: { name: 'Lavandinas y Desinfectantes', description: 'Lavandina concentrada, cloro y desinfectantes' },
  });

  const catPapeles = await prisma.category.upsert({
    where: { name: 'Papeles y Toallas' },
    update: {},
    create: { name: 'Papeles y Toallas', description: 'Rollos de cocina, papel higiénico institucional' },
  });

  const catPisos = await prisma.category.upsert({
    where: { name: 'Limpiadores de Pisos' },
    update: {},
    create: { name: 'Limpiadores de Pisos', description: 'Ceras, desfumantes y aromatizantes para piso' },
  });

  // 6. Proveedor de Ejemplo
  const proveedor = await prisma.supplier.upsert({
    where: { cuit: '30-71123456-8' },
    update: {},
    create: {
      name: 'Química Argentina S.A.',
      cuit: '30-71123456-8',
      contact: 'Juan Pérez',
      phone: '011 4321-8765',
      email: 'ventas@quimicaarg.com.ar',
      ivaCondition: 'Responsable Inscripto',
    },
  });

  // 7. Productos Iniciales con Códigos de Barras + stock inicial por sucursal
  const productosEjemplo = [
    {
      code: '7791234567890',
      name: 'Detergente Concentrado Limón 5L',
      categoryId: catDetergentes.id,
      unit: 'LTS',
      costPrice: 2500,
      profitMargin: 40,
      salePrice: 3500,
      wholesalePrice: 3000,
      supplierId: proveedor.id,
      stockCentral: 25,
      stockFelix: 15,
      minStock: 10,
    },
    {
      code: '7791234567891',
      name: 'Lavandina Concentrada 5L',
      categoryId: catDesinfectantes.id,
      unit: 'LTS',
      costPrice: 1800,
      profitMargin: 40,
      salePrice: 2520,
      wholesalePrice: 2150,
      supplierId: proveedor.id,
      stockCentral: 40,
      stockFelix: 20,
      minStock: 15,
    },
    {
      code: '7791234567892',
      name: 'Papel Higiénico Institucional 4x300m',
      categoryId: catPapeles.id,
      unit: 'PACK',
      costPrice: 6200,
      profitMargin: 35,
      salePrice: 8370,
      wholesalePrice: 7200,
      supplierId: proveedor.id,
      stockCentral: 12,
      stockFelix: 6,
      minStock: 5,
    },
    {
      code: '7791234567893',
      name: 'Limpiador de Pisos Lavanda 5L',
      categoryId: catPisos.id,
      unit: 'LTS',
      costPrice: 2200,
      profitMargin: 40,
      salePrice: 3080,
      wholesalePrice: 2600,
      supplierId: proveedor.id,
      stockCentral: 20,
      stockFelix: 10,
      minStock: 8,
    },
  ];

  for (const prod of productosEjemplo) {
    const { stockCentral, stockFelix, minStock, ...productData } = prod;
    const p = await prisma.product.upsert({
      where: { code: prod.code },
      update: {},
      create: productData,
    });

    for (const [sucursal, stock] of [
      [sucursalCentral, stockCentral],
      [sucursalFelixSanMartin, stockFelix],
    ] as const) {
      await prisma.productStock.upsert({
        where: { productId_sucursalId: { productId: p.id, sucursalId: sucursal.id } },
        update: {},
        create: {
          productId: p.id,
          sucursalId: sucursal.id,
          currentStock: stock,
          minStock,
        },
      });

      await prisma.stockMovement.create({
        data: {
          productId: p.id,
          sucursalId: sucursal.id,
          movementType: 'MANUAL_IN',
          quantity: stock,
          previousStock: 0,
          newStock: stock,
          reason: 'Stock inicial del sistema',
          userId: admin.id,
        },
      });
    }
  }

  console.log('✅ Carga de datos iniciales completada.');
  console.log(`   Sucursales: "${sucursalCentral.nombre}" (Pto. Vta. ${sucursalCentral.ptoVtaArca}), "${sucursalFelixSanMartin.nombre}" (Pto. Vta. ${sucursalFelixSanMartin.ptoVtaArca})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
