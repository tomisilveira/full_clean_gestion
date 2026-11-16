// Lista pública de proveedores que procesan datos del sistema (se muestra en /proveedores).
// Mantenerla al día si se cambia de hosting/base de datos o se suma un servicio nuevo:
// es lo que la política de privacidad promete a clientes y usuarios.
export interface DataProvider {
  name: string;
  role: string;
  data: string;
  country: string;
}

export const DATA_PROVIDERS: DataProvider[] = [
  {
    name: 'Neon (Neon, Inc.)',
    role: 'Base de datos PostgreSQL en la nube, donde se almacena toda la información del sistema.',
    data: 'Todos los datos cargados: usuarios, clientes, proveedores, productos, ventas, caja y comprobantes.',
    country: 'Según la región elegida al crear el proyecto (Estados Unidos, Unión Europea o Brasil).',
  },
  {
    name: 'Render (Render Services, Inc.)',
    role: 'Hosting donde corre la aplicación (servidor y sitio web).',
    data: 'Datos en tránsito entre el navegador y el servidor, y registros técnicos del servidor.',
    country: 'Según la región elegida al crear el servicio (Estados Unidos, Unión Europea o Singapur).',
  },
  {
    name: 'Mercado Pago (MercadoLibre S.R.L.)',
    role: 'Procesamiento de cobros electrónicos, cuando se usa ese medio de pago.',
    data: 'Importe y número de referencia de la venta. No se le envían los datos personales del cliente.',
    country: 'Argentina.',
  },
  {
    name: 'ARCA, ex AFIP (organismo público)',
    role: 'Emisión de facturas electrónicas y obtención del CAE, por obligación legal.',
    data: 'CUIT/DNI y condición frente al IVA del receptor del comprobante, e importes.',
    country: 'Argentina.',
  },
];
