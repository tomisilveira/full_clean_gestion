import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  ShoppingCart,
  Package,
  Wallet,
  Users,
  Truck,
  FileText,
  Receipt,
  BarChart3,
  Settings,
  AlertTriangle,
  FilePlus2,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

interface SidebarProps {
  // Estado del drawer en mobile (< md). En desktop el sidebar es siempre visible y
  // estas props no tienen efecto visual (se ignora "open", "onClose" no se dispara).
  open?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ open = false, onClose }) => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  // Reportes: ADMIN y SOLO_CONSULTA (ese rol existe justamente para esto, ver README).
  // VENDEDOR no debe ver rentabilidad, valorización de stock ni caja consolidada.
  const canSeeReports = user?.role === 'ADMIN' || user?.role === 'SOLO_CONSULTA';

  // Poll low stock count every 2 minutes
  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['sidebarLowStock'],
    queryFn: async () => (await api.get('/products/low-stock')).data,
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const lowStockCount: number = lowStockProducts.length;

  const links = [
    { to: '/', label: 'Punto de Venta', icon: ShoppingCart, exact: true },
    { to: '/products', label: 'Stock e Inventario', icon: Package, badge: lowStockCount > 0 ? lowStockCount : null },
    { to: '/cash', label: 'Caja y Arqueos', icon: Wallet },
    { to: '/customers', label: 'Clientes y Cta. Cte.', icon: Users },
    { to: '/suppliers', label: 'Proveedores y Compras', icon: Truck },
    { to: '/budgets', label: 'Presupuestos', icon: FileText },
    { to: '/sales', label: 'Ventas y Facturación', icon: Receipt },
    ...(isAdmin ? [{ to: '/manual-invoices', label: 'Facturación Libre', icon: FilePlus2 }] : []),
    ...(canSeeReports ? [{ to: '/reports', label: 'Reportes y Métricas', icon: BarChart3 }] : []),
    ...(isAdmin ? [{ to: '/config', label: 'Configuración', icon: Settings }] : []),
  ];

  return (
    <>
      {/* Backdrop: solo en mobile y solo cuando el drawer está abierto. */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* En mobile es un drawer fijo que entra/sale con translate-x; en md+ vuelve a ser
          parte normal del flujo (estático, siempre visible), como era antes. */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-surface2 flex flex-col
          transition-transform duration-200 ease-out
          md:static md:z-auto md:translate-x-0 md:shrink-0 md:min-h-[calc(100vh-4rem)]
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4 md:hidden">
          <span className="font-bold text-heading text-sm">Menú</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-secondary hover:bg-surface2 hover:text-heading transition"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;
            const badge = (link as any).badge;

            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={(link as any).exact}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition group ${
                    isActive
                      ? 'bg-teal-600/20 text-accent border border-teal-500/30 shadow-sm'
                      : 'text-secondary hover:bg-surface2/80 hover:text-heading border border-transparent'
                  }`
                }
              >
                <div className="flex items-center space-x-3">
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{link.label}</span>
                </div>

                {badge !== null && badge !== undefined && (
                  <span
                    className="flex items-center gap-1 bg-amber-500/20 text-amber-400 border border-amber-500/40
                      text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                    title={`${badge} productos bajo stock mínimo`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Low stock alert banner */}
        {lowStockCount > 0 && (
          <div className="mx-4 mb-3 p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-400">
            <div className="font-bold mb-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {lowStockCount} producto{lowStockCount > 1 ? 's' : ''} bajo mínimo
            </div>
            <div className="text-amber-500/70">Ir a Stock e Inventario para reponer</div>
          </div>
        )}

        <div className="p-4 border-t border-surface2 text-xs text-muted text-center">
          Full Clean v1.0 • {user?.name || 'Sistema'}
        </div>
      </aside>
    </>
  );
};
