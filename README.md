# Full Clean Gestión - Sistema de Gestión Comercial Multi-Sucursal

Sistema de gestión integral para negocio de artículos de limpieza con **más de un local**. Reemplaza Nextar con soporte completo de **Facturación Electrónica ARCA (ex AFIP)**, caja, stock, clientes mayoristas, presupuestos y Mercado Pago — todo **independiente por sucursal**, con reportes consolidados o por local.

---

## 🏢 Multi-Sucursal: cómo funciona

- **Stock, caja y ventas son independientes por sucursal.** Un mismo producto tiene cantidades de stock distintas en cada local (`ProductStock`), y solo se puede transferir stock entre sucursales explícitamente.
- **Cada sucursal tiene su propio punto de venta ARCA.** Al emitir una factura, el sistema usa el `ptoVtaArca` de la sucursal donde se generó la venta — no hace falta elegirlo a mano.
- **Cada usuario está asociado a una o más sucursales** (tabla `UserSucursal`). Un `ADMIN` ve y opera todas las sucursales; un `VENDEDOR` o `SOLO_CONSULTA` solo las que se le asignen.
- **Al iniciar sesión**, si el usuario tiene más de una sucursal disponible, el sistema pide elegir con cuál va a operar antes de dejarlo entrar a caja/ventas/stock. Se puede cambiar de sucursal en cualquier momento desde el selector en la barra superior (esto emite un nuevo token con la sucursal elegida).
- **Clientes, proveedores y sus cuentas corrientes son globales** (no por sucursal) — es la misma empresa vista desde cualquier local.
- **Reportes**: por defecto muestran datos de la sucursal activa; un `ADMIN` puede alternar a "Todas las Sucursales (Consolidado)".

---

## 🚀 Inicio Rápido (Primera Vez)

### Requisitos Previos

| Herramienta | Versión Mínima | Descarga |
|---|---|---|
| Node.js | v18+ | https://nodejs.org |
| npm | v9+ | Incluido con Node.js |
| PostgreSQL | v14+ | https://www.postgresql.org/download/ (o `winget install PostgreSQL.PostgreSQL.17` en Windows) |

> El sistema requiere **PostgreSQL** (no SQLite): al ser multi-sucursal y correr en un servidor central accesible desde varios locales por internet, necesita un motor con soporte real de escritura concurrente y transacciones — algo que SQLite no ofrece de forma confiable en ese escenario.

### Paso 1: Levantar PostgreSQL y crear la base

Si no tenés PostgreSQL instalado localmente:

```bash
winget install -e --id PostgreSQL.PostgreSQL.17 --accept-source-agreements --accept-package-agreements
```

Crear el usuario y la base de datos de la aplicación (reemplazá la contraseña por una propia):

```bash
psql -U postgres -h 127.0.0.1 -c "CREATE USER fullclean_app WITH PASSWORD 'fullclean_dev_pw' CREATEDB;"
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE fullclean_dev OWNER fullclean_app;"
```

### Paso 2: Instalar dependencias

```bash
npm run install:all
```

(o manualmente: `npm install` en `/backend` y en `/frontend`)

### Paso 3: Configurar `backend/.env`

```env
DATABASE_URL="postgresql://fullclean_app:fullclean_dev_pw@127.0.0.1:5432/fullclean_dev?schema=public"
```

### Paso 4: Migrar y cargar datos iniciales

```bash
cd backend
npx prisma migrate dev
npx ts-node-dev prisma/seed.ts
```

Esto crea:
- **2 sucursales** de ejemplo (renombralas/agregá más desde **Configuración → Sucursales**)
- **Usuario admin**: `admin` / `admin123` (asignado a todas las sucursales)
- **Usuario vendedor**: `vendedor` / `vendedor123` (asignado a una sola sucursal)
- **4 categorías** de artículos de limpieza
- **4 productos** de ejemplo con stock independiente en cada sucursal
- **1 proveedor** de ejemplo

### Paso 5: Iniciar los Servidores

**Opción A — Con un doble clic:**
```
Ejecutar el archivo: start.bat
```

**Opción B — Manual (dos terminales):**
```bash
npm run dev:backend
npm run dev:frontend
```

### Paso 6: Abrir el Sistema

Navegar a **http://localhost:5173**. Si el usuario tiene más de una sucursal asignada, el sistema va a pedir elegir con cuál operar antes de mostrar el punto de venta.

---

## 🏗️ Arquitectura del Sistema

```
full_clean_gestion/
├── backend/                # API REST (Express + TypeScript + Prisma + PostgreSQL)
│   ├── src/
│   │   ├── index.ts
│   │   ├── middleware/auth.ts      # JWT + rol + sucursal activa (requireSucursal)
│   │   ├── utils/sucursales.ts     # Resolución de sucursales por usuario/rol
│   │   ├── routes/
│   │   │   ├── auth.routes.ts        # login en 2 pasos + selección de sucursal
│   │   │   ├── sucursales.routes.ts  # CRUD de sucursales (ADMIN)
│   │   │   ├── products.routes.ts    # catálogo global + stock por sucursal + transferencias
│   │   │   ├── cash.routes.ts        # caja por sucursal
│   │   │   ├── sales.routes.ts       # ventas atadas a sucursal
│   │   │   ├── customers.routes.ts
│   │   │   ├── suppliers.routes.ts   # compras impactan stock de la sucursal activa
│   │   │   ├── budgets.routes.ts
│   │   │   ├── tickets.routes.ts     # ticket usa dirección/impresora de la sucursal
│   │   │   ├── arca.routes.ts        # ptoVta viene de la sucursal de la venta
│   │   │   ├── mercadopago.routes.ts # webhook con conciliación real
│   │   │   └── reports.routes.ts     # por sucursal o consolidado
│   │   └── db/prisma.ts
│   ├── prisma/schema.prisma          # Sucursal, UserSucursal, ProductStock, etc.
│   └── certs/                        # Certificados ARCA (no versionar)
│
├── frontend/               # SPA React + Vite + TailwindCSS
│   └── src/
│       ├── components/SucursalGate.tsx  # pantalla de selección de sucursal post-login
│       ├── store/useAuthStore.ts        # user, token, sucursales, activeSucursal
│       ├── pages/ConfigPage.tsx         # tabs: Empresa / Sucursales / Usuarios
│       └── pages/...
│
├── backups/
├── start.bat
└── backup.bat
```

---

## 🗄️ Modelo de Datos Multi-Sucursal (resumen)

- **`Sucursal`**: nombre, dirección, `ptoVtaArca`, ancho de ticket, config de impresora.
- **`UserSucursal`**: tabla puente usuario ↔ sucursal (n a n). `ADMIN` no depende de esta tabla para el acceso (ve todas), pero igual puede tener filas para aparecer en listados.
- **`ProductStock`**: `(productId, sucursalId)` único — el stock real vive acá, no en `Product`.
- **`StockMovement`**: tiene `sucursalId` (y `sucursalDestinoId` en transferencias).
- **`CashSession` / `Sale` / `Purchase`**: todas tienen `sucursalId`.
- **`Product` / `Customer` / `Supplier`**: catálogo y terceros globales, compartidos entre sucursales.

---

## 🔑 Módulos y Funcionalidades

| Módulo | Descripción |
|---|---|
| **Punto de Venta (POS)** | Lector de código de barras, carrito, pagos combinados, stock de la sucursal activa |
| **Stock e Inventario** | CRUD productos (catálogo global), stock por sucursal, transferencias entre sucursales, alertas de mínimo por sucursal |
| **Caja** | Apertura/cierre independiente por sucursal, arqueo, desglose por medio de pago |
| **Clientes** | Consumidor Final + Mayoristas, cuentas corrientes globales, historial |
| **Proveedores** | Compras que impactan el stock de la sucursal activa, cuentas corrientes |
| **Presupuestos** | Cotizaciones con PDF, conversión a venta |
| **Ventas** | Historial filtrable por sucursal o consolidado, anulación con reversión de stock |
| **Facturación ARCA** | Facturas A/B/C con el punto de venta de la sucursal emisora, CAE en tiempo real |
| **Mercado Pago** | Checkout Pro + conciliación automática vía webhook contra la venta y su sucursal |
| **Tickets Térmicos** | Usa dirección/impresora configuradas por sucursal |
| **Reportes** | Por sucursal o consolidado: ventas, rentabilidad, stock valorizado, caja |

---

## 🔐 Roles de Usuario

| Rol | Permisos |
|---|---|
| `ADMIN` | Acceso total, todas las sucursales, gestión de usuarios/sucursales/config |
| `VENDEDOR` | Ventas, caja, stock — limitado a su(s) sucursal(es) asignada(s) |
| `SOLO_CONSULTA` | Solo reportes/consultas, limitado a su(s) sucursal(es) asignada(s) |

Gestión de usuarios y su asignación a sucursales: **Configuración → Usuarios** (solo ADMIN).

---

## 🧾 Configuración de Facturación Electrónica ARCA (ex AFIP)

### Punto de venta por sucursal

Cada sucursal necesita su propio punto de venta habilitado en ARCA. Se configura desde **Configuración → Sucursales → Pto. Vta. ARCA**. El certificado digital y el CUIT son únicos para toda la empresa (CUIT y condición de IVA se configuran en **Configuración → Empresa**), pero cada venta se emite con el punto de venta de la sucursal donde ocurrió.

### Entorno de Homologación (Testing) — Ya configurado por defecto

Sin certificados cargados, el sistema emite comprobantes mock con CAE simulado (usando el `ptoVtaArca` real de cada sucursal, para que la numeración ya sea representativa).

### Cargar el certificado digital (para cualquier empresa, sin tocar el servidor)

1. Generar el par clave privada + CSR (ver más abajo cómo, o pedírselo a quien administre el sistema).
2. Con Clave Fiscal nivel 3+, entrar a **arca.gob.ar → Administración de Certificados Digitales**, subir el CSR y generar el `.crt`. Asociarlo al Web Service **wsfe** desde el Administrador de Relaciones de Clave Fiscal.
3. Desde la UI: **Configuración → Empresa → Certificado Digital ARCA**, subir el `.crt` y el `.key` correspondientes al ambiente (Homologación o Producción). Quedan guardados en `backend/certs/` (nunca se versionan ni salen del servidor).
4. Completar el CUIT y la Condición de IVA reales en **Configuración → Empresa**.
5. Verificar/ajustar el `ptoVtaArca` de **cada sucursal** en Configuración → Sucursales para que coincida con el punto de venta real habilitado en ARCA para ese local.
6. Elegir el ambiente desde la UI: **Configuración → Empresa → Entorno ARCA/AFIP** (Homologación o Producción).

> Alternativa manual (deploys sin UI accesible): copiar los archivos directamente a `backend/certs/homologacion.{crt,key}` o `backend/certs/produccion.{crt,key}`, o definir `AFIP_CERT_PATH`/`AFIP_KEY_PATH` en `backend/.env` para apuntar a otra ubicación (tiene prioridad si el archivo existe).

### Generar el CSR y la clave privada con OpenSSL

```bash
openssl genrsa -out miclave_privada.key 2048
openssl req -new -key miclave_privada.key -subj "/C=AR/O=NOMBRE_EMPRESA/CN=UN_ALIAS/serialNumber=CUIT 20XXXXXXXXX" -out solicitud.csr
```

El `.csr` es lo que se sube en ARCA para generar el certificado; `miclave_privada.key` es lo que después se carga junto con el `.crt` resultante en el paso 3 de arriba.

---

## 💳 Configuración de Mercado Pago

1. Ingresar a https://www.mercadopago.com.ar/developers, crear una aplicación y copiar el **Access Token**.
2. Editar `backend/.env`:
   ```env
   MP_ACCESS_TOKEN=APP_USR-XXXXXXXXXXXX-XXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX-XXXXXXXXX
   MP_WEBHOOK_URL=https://TU_DOMINIO_O_IP:4000/api/mercadopago/webhook
   ```

El webhook (`POST /api/mercadopago/webhook`) re-consulta el pago contra la API de Mercado Pago (no confía en el body de la notificación), y si está `approved` registra el `Payment` y el movimiento de caja **en la sucursal de la venta correspondiente** (identificada por `external_reference` = id de la venta), de forma idempotente.

> **Webhooks**: para que Mercado Pago notifique en tiempo real necesita poder llegar a `MP_WEBHOOK_URL` desde internet (servidor con IP/dominio público, o `ngrok` en desarrollo).

---

## 🖨️ Configuración de Impresora Térmica ESC/POS

La dirección de impresora, interfaz (Red/USB/Ninguna) y ancho de papel (58mm/80mm) se configuran **por sucursal** desde **Configuración → Sucursales**.

### Impresión desde Navegador (sin configuración)

Al finalizar una venta, **"Imprimir Ticket (Vista Navegador)"** abre una página lista para imprimir con los datos de la sucursal correspondiente.

### Impresión ESC/POS Directa (red o USB)

Configurar por sucursal en **Configuración → Sucursales**:
- Interfaz de Impresora: `Red (TCP/IP)` o `USB`
- Dirección de Impresora: ej. `tcp://192.168.1.100:9100` (red) o `\\NOMBRE_PC\NOMBRE_IMPRESORA` (USB Windows)

---

## 💾 Backups Automáticos

### Manual
```bash
backup.bat
```
(usa `pg_dump` contra `DATABASE_URL` — ajustar el script si cambia el motor/credenciales)

### Automático diario con el Programador de Tareas de Windows

1. Abrir `taskschd.msc`
2. Crear tarea básica: Diariamente 02:00 AM → `C:\ruta\al\sistema\backup.bat`
3. Backups en `/backups/` con timestamp, se auto-eliminan luego de 30 días.

---

## 🧪 Tests

```bash
cd backend
npm test
```

Cubre lógica crítica: cálculo de precio/IVA, arqueo de caja, movimientos de stock, **stock independiente por sucursal, transferencias entre sucursales, aislamiento de caja por sucursal, y numeración de comprobantes ARCA por punto de venta de sucursal**.

---

## 🔧 Variables de Entorno Completas (`backend/.env`)

```env
# Servidor
PORT=4000
NODE_ENV=development

# Base de Datos (PostgreSQL)
DATABASE_URL="postgresql://fullclean_app:fullclean_dev_pw@127.0.0.1:5432/fullclean_dev?schema=public"

# JWT
JWT_SECRET="cambiar_por_clave_segura_en_produccion"

# ARCA / AFIP — normalmente no hace falta tocar nada acá: el CUIT se carga desde
# Configuración → Empresa, y los certificados desde Configuración → Empresa → Certificado
# Digital ARCA (se guardan en backend/certs/homologacion.* y produccion.*).
# AFIP_CUIT / AFIP_CERT_PATH / AFIP_KEY_PATH son solo overrides opcionales para deploys avanzados.
AFIP_PRODUCTION=false

# Mercado Pago
MP_ACCESS_TOKEN=TEST-xxxx-xxxx-xxxx-xxxxxxxxxxxx-xxxxxxxxx
MP_WEBHOOK_URL=http://localhost:4000/api/mercadopago/webhook
```

---

## 📋 Endpoints de la API (principales)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login. Auto-selecciona sucursal si hay una sola disponible |
| POST | `/api/auth/select-sucursal` | Elegir/cambiar la sucursal activa (emite nuevo token) |
| GET | `/api/auth/me` | Usuario autenticado + sucursales disponibles + sucursal activa |
| GET/POST/PUT | `/api/sucursales` | CRUD de sucursales (ADMIN) |
| GET | `/api/products` | Catálogo con stock de la sucursal activa (`?sucursalId=` para ADMIN) |
| GET | `/api/products/low-stock` | Bajo mínimo en la sucursal activa (`?all=true` consolidado, ADMIN) |
| POST | `/api/products/quick-barcode` | Alta rápida desde POS |
| POST | `/api/products/:id/transfer` | Transferencia de stock entre sucursales (ADMIN) |
| GET/POST | `/api/cash/current`, `/api/cash/open`, `/api/cash/close` | Caja de la sucursal activa |
| POST | `/api/sales` | Venta atada a la sucursal activa (requiere caja abierta ahí) |
| POST | `/api/sales/:id/cancel` | Anular venta y revertir stock en su sucursal |
| POST | `/api/arca/invoice/:saleId` | Emitir factura con el punto de venta de la sucursal de la venta |
| GET | `/api/tickets/sale/:id/html` | Ticket con datos de la sucursal de la venta |
| POST | `/api/mercadopago/webhook` | Conciliación automática por venta/sucursal |
| GET | `/api/reports/*` | Por sucursal activa o `?all=true` / `?sucursalId=` (ADMIN) |

---

## 🛡️ Seguridad en Producción

- Cambiar `JWT_SECRET` por una cadena aleatoria larga (mínimo 64 caracteres)
- Nunca subir `.env` ni `certs/` al repositorio Git (ya excluidos en `.gitignore`)
- Usar una contraseña fuerte para el usuario de PostgreSQL de producción (no la de desarrollo local)
- El servidor corre centralizado y se accede por internet desde cada sucursal: HTTPS + firewall son responsabilidad del hosting elegido
- Para acceso desde varias sucursales: reemplazar `localhost` por el dominio/IP del servidor en `frontend/vite.config.ts` (o el build de producción del frontend) y en `MP_WEBHOOK_URL`

---

## 🎨 Logo y Paleta de Colores

El logo de la empresa va en `frontend/public/logo.png` (referenciado desde el Navbar). Colores extraídos de la identidad de marca (a confirmar con el archivo final): celeste `#4FC3E8`, azul medio `#2E8FC0`, azul oscuro `#1A5A8A`.

---

*Full Clean Gestión — Desarrollado a medida para negocio de artículos de limpieza en Argentina, con soporte multi-sucursal desde el modelo de datos.*
