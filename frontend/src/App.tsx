import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { SucursalGate } from './components/SucursalGate';
import { LoginPage } from './pages/LoginPage';
import { PosPage } from './pages/PosPage';
import { ProductsPage } from './pages/ProductsPage';
import { CashPage } from './pages/CashPage';
import { CustomersPage } from './pages/CustomersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { SalesPage } from './pages/SalesPage';
import { ReportsPage } from './pages/ReportsPage';
import { ConfigPage } from './pages/ConfigPage';

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, activeSucursal } = useAuthStore();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!activeSucursal) {
    return <SucursalGate />;
  }

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-app">{children}</main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
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
          <ProtectedLayout>
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
  );
};
