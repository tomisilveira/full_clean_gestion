import React, { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { LogOut, DollarSign, Shield, Building2 } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export const Navbar: React.FC = () => {
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
    <header className="h-16 border-b border-surface2 bg-surface/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
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
        <div>
          <h1 className="font-bold text-heading text-base leading-tight">Full Clean</h1>
          <p className="text-xs text-secondary">Sistema de Gestión Comercial</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Sucursal Selector */}
        <div className="relative">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border bg-sky-950/60 border-sky-800/80 text-sky-300">
            <Building2 className="w-3.5 h-3.5" />
            {sucursales.length > 1 ? (
              <select
                value={activeSucursal?.id || ''}
                onChange={(e) => handleSwitchSucursal(parseInt(e.target.value))}
                className="bg-transparent focus:outline-none cursor-pointer"
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id} className="text-slate-900">
                    {s.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <span>{activeSucursal?.nombre}</span>
            )}
          </div>
        </div>

        {/* Cash Status Indicator */}
        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-2 border ${
          activeSession
            ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
            : 'bg-amber-950/60 border-amber-800/80 text-amber-400'
        }`}>
          <DollarSign className="w-3.5 h-3.5" />
          <span>{activeSession ? `Caja Abierta (Monto Inicial: $${activeSession.initialAmount})` : 'Caja Cerrada'}</span>
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center space-x-3 border-l border-surface2 pl-4">
          <div className="text-right">
            <div className="text-sm font-medium text-heading">{user?.name}</div>
            <div className="text-[11px] text-teal-400 uppercase tracking-wider font-mono flex items-center justify-end gap-1">
              <Shield className="w-3 h-3" />
              {user?.role}
            </div>
          </div>
          <ThemeToggle />
          <button
            onClick={logout}
            title="Cerrar Sesión"
            className="p-2 rounded-lg bg-surface2 hover:bg-surface3 text-secondary hover:text-red-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
