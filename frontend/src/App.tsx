import React, { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { SucursalGate } from './components/SucursalGate';
import { Toaster } from './components/Toaster';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Carga diferida por pantalla (code splitting): el bundle único pesaba ~510 kB y se
// descargaba completo hasta para ver el login. Ahora cada página se baja recién al entrar.
// Las páginas exportan por nombre, de ahí el `.then(m => ({ default: ... }))`.
const PosPage = lazy(() => import('./pages/PosPage').then((m) => ({ default: m.PosPage })));
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const CashPage = lazy(() => import('./pages/CashPage').then((m) => ({ default: m.CashPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage })));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage').then((m) => ({ default: m.BudgetsPage })));
const ManualInvoicesPage = lazy(() => import('./pages/ManualInvoicesPage').then((m) => ({ default: m.ManualInvoicesPage })));
const SalesPage = lazy(() => import('./pages/SalesPage').then((m) => ({ default: m.SalesPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then((m) => ({ default: m.ConfigPage })));
const PrivacyPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })));
const ProvidersPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.ProvidersPage })));

// Estado de carga mientras baja el código de una pantalla.
const PageLoading: React.FC = () => (
  <div role="status" aria-live="polite" className="min-h-[40vh] flex items-center justify-center text-sm text-secondary">
    Cargando…
  </div>
);

const ProtectedLayout: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles,
}) => {
  const { token, activeSucursal, user } = useAuthStore();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Cierra el drawer de navegación mobile al cambiar de página (si quedó abierto).
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!activeSucursal) {
    return <SucursalGate />;
  }

  // El link ya está oculto en el Sidebar para roles sin acceso, pero esto evita que
  // alguien entre igual escribiendo la URL a mano (el backend también lo rechaza,
  // esto es solo para no mostrar una pantalla que después falla al pedir datos).
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <Navbar onToggleMenu={() => setMobileNavOpen((o) => !o)} />
      {/* min-w-0 es necesario para que los overflow-x-auto de las tablas de cada página
          scrolleen puertas adentro en vez de estirar todo el layout horizontalmente en
          mobile (comportamiento por defecto de flexbox: un hijo no se achica más allá
          del ancho intrínseco de su contenido salvo que se le dé min-width: 0). */}
      <div className="flex flex-1 overflow-hidden min-w-0">
        <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <main className="flex-1 min-w-0 overflow-y-auto bg-app">{children}</main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <>
    <Toaster />
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedLayout>
            <PosPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/products"
        element={
          <ProtectedLayout>
            <ProductsPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/cash"
        element={
          <ProtectedLayout>
            <CashPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/customers"
        element={
          <ProtectedLayout>
            <CustomersPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/suppliers"
        element={
          <ProtectedLayout>
            <SuppliersPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/budgets"
        element={
          <ProtectedLayout>
            <BudgetsPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/manual-invoices"
        element={
          <ProtectedLayout allowedRoles={['ADMIN']}>
            <ManualInvoicesPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/sales"
        element={
          <ProtectedLayout>
            <SalesPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedLayout allowedRoles={['ADMIN', 'SOLO_CONSULTA']}>
            <ReportsPage />
          </ProtectedLayout>
        }
      />

      <Route
        path="/config"
        element={
          <ProtectedLayout>
            <ConfigPage />
          </ProtectedLayout>
        }
      />

      {/* Páginas públicas: se leen sin iniciar sesión (política de privacidad, términos, proveedores). */}
      <Route path="/privacidad" element={<PrivacyPage />} />
      <Route path="/terminos" element={<TermsPage />} />
      <Route path="/proveedores" element={<ProvidersPage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    </>
  );
};
