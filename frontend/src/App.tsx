import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { SucursalGate } from './components/SucursalGate';
import { Toaster } from './components/Toaster';
import { LoginPage } from './pages/LoginPage';
import { PosPage } from './pages/PosPage';
import { ProductsPage } from './pages/ProductsPage';
import { CashPage } from './pages/CashPage';
import { CustomersPage } from './pages/CustomersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { ManualInvoicesPage } from './pages/ManualInvoicesPage';
import { SalesPage } from './pages/SalesPage';
import { ReportsPage } from './pages/ReportsPage';
import { ConfigPage } from './pages/ConfigPage';

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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
};
