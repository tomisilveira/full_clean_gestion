import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { LogOut, DollarSign, Shield, Menu } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { SucursalSelector } from './SucursalSelector';

interface NavbarProps {
  onToggleMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMenu }) => {
  const { user, logout, sucursales, activeSucursal, setActiveSucursal } = useAuthStore();
  const [logoError, setLogoError] = useState(false);

  const { data: cashData } = useQuery({
    queryKey: ['currentCash', activeSucursal?.id],
    queryFn: async () => {
      const res = await api.get('/cash/current');
      return res.data;
    },
    refetchInterval: 15000,
    enabled: !!activeSucursal,
  });

  const activeSession = cashData?.activeSession;

  const handleSwitchSucursal = async (sucursalId: number) => {
    if (sucursalId === activeSucursal?.id) return;
    const res = await api.post('/auth/select-sucursal', { sucursalId });
    setActiveSucursal(res.data.activeSucursal, res.data.token);
    window.location.reload(); // fuerza a refrescar todas las queries con el contexto de la nueva sucursal
  };

  return (
    <header className="h-16 border-b border-surface2 bg-surface/80 backdrop-blur px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 gap-2">
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        {/* Botón de menú: solo visible en mobile, abre el drawer del Sidebar */}
        <button
          onClick={onToggleMenu}
          className="md:hidden p-2 -ml-1 rounded-lg text-secondary hover:bg-surface2 hover:text-heading transition shrink-0"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="w-9 h-9 rounded-lg bg-surface2 border border-surface3 flex items-center justify-center overflow-hidden shrink-0">
          {logoError ? (
            <span className="font-bold text-teal-500 text-sm">FC</span>
          ) : (
            <img
              src="/logo.png"
              alt="Full Clean"
              className="w-full h-full object-contain p-0.5"
              onError={() => setLogoError(true)}
            />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-heading text-base leading-tight truncate">Full Clean</h1>
          <p className="text-xs text-secondary hidden sm:block">Sistema de Gestión Comercial</p>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Sucursal Selector: en mobile se oculta para no desbordar; queda visible desde
            ~640px (sm) en adelante. */}
        <div className="hidden sm:block">
          <SucursalSelector
            sucursales={sucursales}
            activeSucursal={activeSucursal}
            onSelect={handleSwitchSucursal}
          />
        </div>

        {/* Cash Status Indicator: en mobile queda solo el ícono con color (abierta/cerrada);
            el texto completo aparece desde md en adelante. */}
        <div className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border shrink-0 ${
          activeSession
            ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
            : 'bg-amber-950/60 border-amber-800/80 text-amber-400'
        }`}>
          <DollarSign className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline">
            {activeSession ? `Caja Abierta (Monto Inicial: $${activeSession.initialAmount})` : 'Caja Cerrada'}
          </span>
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center space-x-2 sm:space-x-3 border-l border-surface2 pl-2 sm:pl-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-heading truncate max-w-[10rem]">{user?.name}</div>
            <div className="text-[11px] text-teal-400 uppercase tracking-wider font-mono flex items-center justify-end gap-1">
              <Shield className="w-3 h-3" />
              {user?.role}
            </div>
          </div>
          <ThemeToggle />
          <button
            onClick={logout}
            title="Cerrar Sesión"
            className="p-2 rounded-lg bg-surface2 hover:bg-surface3 text-secondary hover:text-red-400 transition shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
