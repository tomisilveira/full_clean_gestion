# Full Clean Gestión — Sistema de Gestión Comercial Multi-Sucursal

Sistema de gestión integral para un negocio de artículos de limpieza con **más de un local**. Reemplaza a Nextar agregando lo que a ese sistema le faltaba: **Facturación Electrónica ARCA (ex AFIP)**. Además de facturación, cubre stock, caja, clientes mayoristas con cuenta corriente, proveedores, presupuestos y Mercado Pago — todo **independiente por sucursal**, con reportes consolidados o por local.

**Repositorio:** https://github.com/tomisilveira/full_clean_gestion
**Autor:** [@tomisilveira](https://github.com/tomisilveira)

---

## Índice

- [Multi-sucursal: cómo funciona](#-multi-sucursal-cómo-funciona)
- [Inicio rápido (desarrollo local)](#-inicio-rápido-primera-vez)
- [Arquitectura del sistema](#️-arquitectura-del-sistema)
- [Modelo de datos multi-sucursal](#️-modelo-de-datos-multi-sucursal-resumen)
- [Módulos y funcionalidades](#-módulos-y-funcionalidades)
- [Roles de usuario](#-roles-de-usuario)
- [Tema claro / oscuro](#-tema-claro--oscuro)
- [Facturación Electrónica ARCA (ex AFIP)](#-configuración-de-facturación-electrónica-arca-ex-afip)
- [Mercado Pago](#-configuración-de-mercado-pago)
- [Impresora térmica ESC/POS](#️-configuración-de-impresora-térmica-escpos)
- [Deploy a producción / demo (Render + Neon)](#-deploy-a-producción--demo-render--neon)
- [Backups automáticos](#-backups-automáticos)
- [Tests](#-tests)
- [Variables de entorno](#-variables-de-entorno-completas-backendenv)
- [Endpoints de la API](#-endpoints-de-la-api-principales)
- [Seguridad en producción](#️-seguridad-en-producción)
- [Logo y paleta de colores](#-logo-y-paleta-de-colores)
- [Notas técnicas / troubleshooting](#-notas-técnicas--troubleshooting)

---

## 🏢 Multi-sucursal: cómo funciona

- **Stock, caja y ventas son independientes por sucursal.** Un mismo producto tiene cantidades de stock distintas en cada local (`ProductStock`), y solo se transfiere stock entre sucursales de forma explícita (Stock → botón de transferencia, solo ADMIN).
- **Cada sucursal tiene su propio punto de venta ARCA.** Al emitir una factura, el sistema usa el `ptoVtaArca` de la sucursal donde se generó la venta — no hay que elegirlo a mano.
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

> El sistema requiere **PostgreSQL** (no SQLite): al ser multi-sucursal y correr en un servidor central accesible desde varios locales por internet, necesita un motor con soporte real de escritura concurrente y transacciones.

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

### Paso 2: Clonar e instalar dependencias

```bash
git clone https://github.com/tomisilveira/full_clean_gestion.git
cd full_clean_gestion
npm run install:all
```

(o manualmente: `npm install` en `/backend` y en `/frontend`)

### Paso 3: Configurar `backend/.env`

```env
DATABASE_URL="postgresql://fullclean_app:fullclean_dev_pw@127.0.0.1:5432/fullclean_dev?schema=public"
JWT_SECRET="cualquier-cadena-larga-y-aleatoria"
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

Navegar a **http://localhost:5173**. Si el usuario tiene más de una sucursal asignada, el sistema pide elegir con cuál operar antes de mostrar el punto de venta.

---

## 🏗️ Arquitectura del Sistema

```
full_clean_gestion/
├── backend/                # API REST (Express + TypeScript + Prisma + PostgreSQL)
│   ├── src/
│   │   ├── index.ts                  # server + sirve frontend/dist en producción
│   │   ├── middleware/auth.ts        # JWT + rol + sucursal activa (requireSucursal)
│   │   ├── utils/sucursales.ts       # resolución de sucursales por usuario/rol
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
│   │   │   ├── reports.routes.ts     # por sucursal o consolidado
│   │   │   └── config.routes.ts      # datos de empresa + carga de certificados ARCA
│   │   └── db/prisma.ts
│   ├── prisma/schema.prisma          # Sucursal, UserSucursal, ProductStock, etc.
│   └── certs/                        # Certificados ARCA (no versionar; se suben desde la UI)
│
├── frontend/               # SPA React + Vite + TailwindCSS
│   └── src/
│       ├── components/SucursalGate.tsx  # pantalla de selección de sucursal post-login
│       ├── components/ThemeToggle.tsx   # switch de tema claro/oscuro
│       ├── store/useAuthStore.ts        # user, token, sucursales, activeSucursal
│       ├── store/useThemeStore.ts       # tema claro/oscuro persistido
│       ├── pages/ConfigPage.tsx         # tabs: Empresa / Sucursales / Usuarios
│       └── pages/...
│
├── backups/
├── start.bat
└── backup.bat
```

### Stack

- **Backend**: Node.js + TypeScript + Express + Prisma ORM + PostgreSQL
- **Frontend**: React + Vite + TypeScript + TailwindCSS + Zustand + React Query
- **Auth**: JWT con rol + sucursal(es) asociada(s)
- **Facturación electrónica**: `@afipsdk/afip.js` contra WSFEv1 de ARCA
- **Pagos**: SDK oficial de Mercado Pago
- **Impresión**: `node-thermal-printer` (ESC/POS) + vista HTML para navegador

---

## 🗄️ Modelo de Datos Multi-Sucursal (resumen)

- **`Sucursal`**: nombre, dirección, `ptoVtaArca`, ancho de ticket, config de impresora.
- **`UserSucursal`**: tabla puente usuario ↔ sucursal (n a n). `ADMIN` no depende de esta tabla para el acceso (ve todas), pero igual puede tener filas para aparecer en listados.
- **`ProductStock`**: `(productId, sucursalId)` único — el stock real vive acá, no en `Product`.
- **`StockMovement`**: tiene `sucursalId` (y `sucursalDestinoId` en transferencias).
- **`CashSession` / `Sale` / `Purchase`**: todas tienen `sucursalId`.
- **`Product` / `Customer` / `Supplier`**: catálogo y terceros globales, compartidos entre sucursales.
- **`InvoiceARCA`**: guarda `ptoVta`, `cbteTipo`, `cae`, `caeVto`, etc. — vinculada 1 a 1 con `Sale`.

---

## 🔑 Módulos y Funcionalidades

| Módulo | Descripción |
|---|---|
| **Punto de Venta (POS)** | Lector de código de barras, búsqueda por nombre, vista en lista, carrito, pagos combinados, stock de la sucursal activa |
| **Stock e Inventario** | CRUD de productos (catálogo global), stock por sucursal, transferencias entre sucursales, alertas de mínimo por sucursal |
| **Caja** | Apertura/cierre independiente por sucursal, arqueo con diferencia, desglose por medio de pago |
| **Clientes** | Consumidor Final + Mayoristas, cuentas corrientes globales, historial de compras |
| **Proveedores** | Registro de compras que impactan el stock de la sucursal activa, cuentas corrientes |
| **Presupuestos** | Cotizaciones con PDF, conversión directa a venta |
| **Ventas** | Historial filtrable por fecha y por sucursal (o consolidado), anulación con reversión de stock, indicador de qué ventas requieren factura ARCA |
| **Facturación ARCA** | Facturas A/B/C con el punto de venta de la sucursal emisora, CAE en tiempo real, certificado cargable desde la UI |
| **Mercado Pago** | Checkout Pro + conciliación automática vía webhook contra la venta y su sucursal |
| **Tickets Térmicos** | HTML listo para imprimir o ESC/POS directo, con QR real de ARCA, desglose de IVA, y aviso si la venta está pendiente de facturar |
| **Reportes** | Por sucursal o consolidado: ventas, top productos, rentabilidad, stock valorizado, caja |
| **Tema claro/oscuro** | Selector persistente, arranca en claro por defecto |

### ¿Qué ventas necesitan factura ARCA?

Regla aplicada en el sistema: **toda venta a un cliente identificado (con CUIT/DNI cargado — cuenta corriente o mayorista) requiere factura ARCA**. Una venta a Consumidor Final anónimo de mostrador no la requiere obligatoriamente (alcanza con el ticket interno), aunque se puede facturar igual desde el botón correspondiente. La pantalla de Ventas muestra un aviso con la cantidad de ventas pendientes de facturar y permite filtrar solo esas.

---

## 🔐 Roles de Usuario

| Rol | Permisos |
|---|---|
| `ADMIN` | Acceso total, todas las sucursales, gestión de usuarios/sucursales/config |
| `VENDEDOR` | Ventas, caja, stock — limitado a su(s) sucursal(es) asignada(s) |
| `SOLO_CONSULTA` | Solo reportes/consultas, limitado a su(s) sucursal(es) asignada(s) |

Gestión de usuarios y su asignación a sucursales: **Configuración → Usuarios** (solo ADMIN).

---

## 🌗 Tema claro / oscuro

El sistema arranca siempre en **modo claro** la primera vez (no detecta el tema del sistema operativo). El botón de sol/luna en la barra superior (y en el login) cambia el tema y lo recuerda para la próxima vez que se abra, en ese navegador.

Los colores están definidos como variables CSS en `frontend/src/index.css` (`:root` = claro, `.dark` = oscuro) y mapeados a clases de Tailwind semánticas (`bg-app`, `bg-surface`, `text-heading`, `text-secondary`, `text-accent`, etc.) en `frontend/tailwind.config.js`, así que un componente nuevo no necesita escribir estilos distintos por tema: alcanza con usar esas clases.

---

## 🧾 Configuración de Facturación Electrónica ARCA (ex AFIP)

### Punto de venta por sucursal

Cada sucursal necesita su propio punto de venta habilitado en ARCA. Se configura desde **Configuración → Sucursales → Pto. Vta. ARCA**. El certificado digital y el CUIT son únicos para toda la empresa (CUIT y condición de IVA se configuran en **Configuración → Empresa**), pero cada venta se emite con el punto de venta de la sucursal donde ocurrió.

### Entorno de Homologación (Testing) — Ya configurado por defecto

Sin certificados cargados, el sistema emite comprobantes **mock** con CAE simulado (usando el `ptoVtaArca` real de cada sucursal, para que la numeración ya sea representativa). Esto permite demostrar y probar todo el flujo de ventas y tickets sin depender de un certificado real.

### Cargar el certificado digital (para cualquier empresa, sin tocar el servidor)

1. Generar el par clave privada + CSR (ver más abajo cómo).
2. Con Clave Fiscal nivel 3+, entrar a **arca.gob.ar → Administración de Certificados Digitales**, subir el CSR y generar el `.crt`. Asociarlo al Web Service **wsfe** desde el Administrador de Relaciones de Clave Fiscal.
3. Verificar que exista al menos un **punto de venta** habilitado en ARCA con modalidad "Factura Electrónica - Webservices".
4. Desde la UI: **Configuración → Empresa → Certificado Digital ARCA**, subir el `.crt` y el `.key` correspondientes al ambiente (Homologación o Producción). Quedan guardados en `backend/certs/` (nunca se versionan ni salen del servidor).
5. Completar el CUIT y la Condición de IVA reales en **Configuración → Empresa**.
6. Verificar/ajustar el `ptoVtaArca` de **cada sucursal** en Configuración → Sucursales para que coincida con el punto de venta real habilitado en ARCA para ese local.
7. Elegir el ambiente desde la UI: **Configuración → Empresa → Entorno ARCA/AFIP** (Homologación o Producción).

> Alternativa manual (deploys sin UI accesible): copiar los archivos directamente a `backend/certs/homologacion.{crt,key}` o `backend/certs/produccion.{crt,key}`, o definir `AFIP_CERT_PATH`/`AFIP_KEY_PATH` en `backend/.env` para apuntar a otra ubicación (tiene prioridad si el archivo existe).

### Generar el CSR y la clave privada con OpenSSL

```bash
openssl genrsa -out miclave_privada.key 2048
openssl req -new -key miclave_privada.key -subj "/C=AR/O=NOMBRE_EMPRESA/CN=UN_ALIAS/serialNumber=CUIT 20XXXXXXXXX" -out solicitud.csr
```

El `.csr` es lo que se sube en ARCA para generar el certificado; `miclave_privada.key` es lo que después se carga junto con el `.crt` resultante en el paso 4 de arriba. **La clave privada nunca se comparte ni se sube a ningún lado más que al propio servidor** — si se pierde, hay que rehacer el certificado desde cero.

---

## 💳 Configuración de Mercado Pago

1. Ingresar a https://www.mercadopago.com.ar/developers, crear una aplicación y copiar el **Access Token**.
2. Editar `backend/.env`:
   ```env
   MP_ACCESS_TOKEN=APP_USR-XXXXXXXXXXXX-XXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX-XXXXXXXXX
   MP_WEBHOOK_URL=https://TU_DOMINIO_O_IP/api/mercadopago/webhook
   ```

El webhook (`POST /api/mercadopago/webhook`) re-consulta el pago contra la API de Mercado Pago (no confía en el body de la notificación), y si está `approved` registra el `Payment` y el movimiento de caja **en la sucursal de la venta correspondiente** (identificada por `external_reference` = id de la venta), de forma idempotente.

> **Webhooks**: para que Mercado Pago notifique en tiempo real necesita poder llegar a `MP_WEBHOOK_URL` desde internet (servidor con dominio público, o `ngrok` en desarrollo local).

---

## 🖨️ Configuración de Impresora Térmica ESC/POS

La dirección de impresora, interfaz (Red/USB/Ninguna) y ancho de papel (58mm/80mm) se configuran **por sucursal** desde **Configuración → Sucursales**.

### Impresión desde Navegador (sin configuración)

Al finalizar una venta o desde el historial de Ventas, **"Imprimir Ticket"** abre una vista lista para imprimir con los datos de la sucursal correspondiente: encabezado, ítems, desglose de IVA (si está facturada), forma(s) de pago, CAE y QR real, o el aviso de "Ticket no fiscal" / "Pendiente de facturar" cuando corresponde.

### Impresión ESC/POS Directa (red o USB)

Configurar por sucursal en **Configuración → Sucursales**:
- Interfaz de Impresora: `Red (TCP/IP)` o `USB`
- Dirección de Impresora: ej. `tcp://192.168.1.100:9100` (red) o `\\NOMBRE_PC\NOMBRE_IMPRESORA` (USB Windows)

El ticket ESC/POS imprime el QR de ARCA como código real en la impresora (no una imagen descargada), vía `printer.printQR(...)`.

---

## ☁️ Deploy a producción / demo (Render + Neon)

Esta es la forma más simple de tener el sistema accesible por una URL pública, sin servidor propio. Backend y frontend se deployan **juntos como un solo servicio** (Express sirve el build de React desde `frontend/dist`), así que solo hace falta una base de datos y un hosting.

### 1. Base de datos — [Neon](https://neon.tech) (Postgres gratis)

Crear una cuenta y un proyecto nuevo; copiar el **connection string** (`postgresql://...`) que te da.

### 2. Hosting — [Render](https://render.com) (plan gratis)

1. **New +** → **Web Service** → conectar el repositorio de GitHub.
2. Configurar:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
3. Variables de entorno:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | connection string de Neon |
   | `JWT_SECRET` | una cadena aleatoria larga |
   | `NODE_ENV` | `production` |
   | `AFIP_PRODUCTION` | `false` (dejar en homologación hasta tener certificado real) |

4. Deploy. El primer build tarda unos minutos (instala, compila frontend y backend, corre `prisma migrate deploy` y el seed, y arranca el servidor).

> **Plan gratis de Render**: el servicio "duerme" tras ~15 min sin uso; la primera visita después de eso demora ~30 segundos en despertar. Perfecto para una demo, no para producción real con clientes esperando respuesta inmediata.

> El `start:prod` de `backend/package.json` corre `prisma migrate deploy` + el seed (idempotente) en cada arranque — así los usuarios `admin`/`vendedor` de prueba siempre están disponibles para mostrar el sistema, incluso después de un reinicio del contenedor. **No usar ese comportamiento tal cual en un deploy con datos reales de producción** sin revisar primero si conviene sacar el seed automático.

### ¿Y con más de una sucursal en la vida real, sin depender de Render/Neon?

Es una decisión de infraestructura que cada uno resuelve según su caso: puede ser este mismo esquema (Render/Neon u otro cloud) o un servidor propio en la casa central. Lo único que cambia es `DATABASE_URL` y dónde corre el proceso — el código es el mismo.

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

> Si el sistema corre en Render/Neon, los backups los maneja el proveedor de la base (Neon tiene point-in-time recovery en su plan gratis); `backup.bat` es para cuando Postgres corre en un servidor propio.

---

## 🧪 Tests

```bash
cd backend
npm test
```

Cubre lógica crítica: cálculo de precio/IVA, arqueo de caja, movimientos de stock, stock independiente por sucursal, transferencias entre sucursales, aislamiento de caja por sucursal, y numeración de comprobantes ARCA por punto de venta de sucursal.

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
| GET | `/api/sales?startDate=&endDate=` | Historial filtrado por fecha (y sucursal) |
| POST | `/api/sales/:id/cancel` | Anular venta y revertir stock en su sucursal |
| POST | `/api/arca/invoice/:saleId` | Emitir factura con el punto de venta de la sucursal de la venta |
| GET | `/api/tickets/sale/:id/html` | Ticket con datos de la sucursal de la venta (requiere JWT) |
| GET/POST | `/api/config`, `/api/config/arca-cert/:environment` | Datos de empresa + carga de certificado ARCA |
| POST | `/api/mercadopago/webhook` | Conciliación automática por venta/sucursal |
| GET | `/api/reports/*` | Por sucursal activa o `?all=true` / `?sucursalId=` (ADMIN) |

---

## 🛡️ Seguridad en Producción

- Cambiar `JWT_SECRET` por una cadena aleatoria larga (mínimo 64 caracteres) — no reusar la de desarrollo.
- Nunca subir `.env` ni `certs/` al repositorio Git (ya excluidos en `.gitignore`).
- Usar una contraseña fuerte para el usuario de PostgreSQL de producción (no la de desarrollo local).
- El repositorio es **privado** en GitHub — no darlo de alta como público sin revisar antes que no quede nada sensible.
- HTTPS y firewall son responsabilidad del hosting elegido (Render los provee de forma automática con su dominio `.onrender.com`).
- Si se deja el auto-seed en producción real (ver sección de Deploy), tener en cuenta que resetea las contraseñas de `admin`/`vendedor` en cada arranque — conviene sacarlo una vez que el sistema tenga usuarios y datos reales.

---

## 🎨 Logo y Paleta de Colores

El logo de la empresa vive en `frontend/public/logo.png` (se usa en el Navbar y se puede referenciar en tickets vía **Configuración → Empresa → URL del Logo**). Paleta extraída directamente de los píxeles del logo real:

| Color | Hex | Uso |
|---|---|---|
| Cian brillante | `#5CE1E6` | Burbujas / acentos claros |
| Azul principal | `#46A6D8` | Cuerpo de la gota — color de marca principal |
| Azul oscuro | `#1478B3` | Base / anillo exterior |
| Navy | `#2A3C8E` | Punto de acento oscuro |

Estos valores ya están cargados en `frontend/tailwind.config.js` bajo la clave `brand` (`brand-400` a `brand-900`). La interfaz actual todavía usa la paleta `teal` genérica de Tailwind para botones y acentos — reemplazarla por `brand-*` en todo el frontend es una tarea pendiente de pulido visual, no bloqueante.

---

## 🔍 Notas técnicas / troubleshooting

Cosas no obvias que costaron tiempo de deploy y vale la pena que quede documentado:

- **No hay `package-lock.json` versionado.** Se generó originalmente en Windows, y algunos paquetes (`rollup`, usado por Vite) tienen binarios nativos distintos por sistema operativo — un lockfile de Windows rompe la instalación en Linux (bug conocido de npm, [npm/cli#4828](https://github.com/npm/cli/issues/4828)). Por eso `package-lock.json` está en `.gitignore` y cada entorno resuelve el suyo con `npm install`. Si en algún momento se quiere volver a versionarlo, generarlo en el mismo SO donde se va a deployar (o usar Docker para que sea siempre el mismo entorno).
- **El `.npmrc` con `production=false`** es necesario porque Render (y varios hosts similares) setean `NODE_ENV=production` durante el build, y con eso `npm install` omite las `devDependencies` por defecto — ahí viven `vite`, `typescript`, `tailwindcss`, que hacen falta para compilar aunque no para correr después.
- **El build de backend corre `prisma generate` explícitamente antes de `tsc`** (no depende del postinstall automático de Prisma), porque en el contexto de un monorepo con workspaces ese postinstall puede no encontrar el `schema.prisma` y generar un cliente vacío, causando errores de tipo en cascada por todo el código que usa Prisma.
- **`frontend/src/react-dom-client.d.ts`** es un shim de tipos mínimo para el subpath `react-dom/client`: en el entorno Linux de Render, TypeScript no encontraba esa declaración pese a que `@types/react-dom` la incluye (sí se encuentra en Windows). El módulo real en runtime no cambia, solo se le da a TS una firma para no romper el type-check ahí.

---

*Full Clean Gestión — desarrollado a medida para un negocio de artículos de limpieza en Argentina, con soporte multi-sucursal desde el modelo de datos.*
