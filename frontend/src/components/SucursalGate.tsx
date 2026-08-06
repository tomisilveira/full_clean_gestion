import React, { useEffect, useState } from 'react';
import { Building2, ArrowRight, LogOut, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';

// Pantalla intermedia: si el usuario tiene más de una sucursal disponible (o es ADMIN),
// debe elegir con cuál va a operar antes de acceder a caja, ventas o stock.
export const SucursalGate: React.FC = () => {
  const { sucursales, setActiveSucursal, syncSucursales, logout } = useAuthStore();
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [checking, setChecking] = useState(sucursales.length === 0);
  const [error, setError] = useState('');

  // Si no hay sucursales en el store (típicamente una sesión guardada de antes de que existiera
  // esta funcionalidad), refrescamos contra el servidor en vez de asumir que el usuario no tiene
  // ninguna asignada.
  useEffect(() => {
    if (sucursales.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/auth/me');
        if (!cancelled) syncSucursales(res.data.user, res.data.sucursales);
      } catch {
        // El interceptor de la API ya redirige a /login si el token es inválido.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = async (sucursalId: number) => {
    setError('');
    setLoadingId(sucursalId);
    try {
      const res = await api.post('/auth/select-sucursal', { sucursalId });
      setActiveSucursal(res.data.activeSucursal, res.data.token);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al seleccionar la sucursal.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-surface2 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-teal-600/20 border border-teal-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-teal-400">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-heading">Elegí una sucursal</h1>
          <p className="text-sm text-secondary mt-1">Vas a operar caja, stock y ventas en la sucursal que selecciones.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800 text-red-300 text-sm rounded-xl text-center">
            {error}
          </div>
        )}

        {checking ? (
          <div className="flex items-center justify-center gap-2 text-secondary text-sm py-6">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Verificando tus sucursales...
          </div>
        ) : (
          <div className="space-y-2">
            {sucursales.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id)}
                disabled={loadingId !== null}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-surface2 border border-surface3 rounded-xl text-left hover:border-teal-500 hover:bg-surface3 transition disabled:opacity-50"
              >
                <div>
                  <div className="font-semibold text-heading">{s.nombre}</div>
                  {s.direccion && <div className="text-xs text-secondary">{s.direccion}</div>}
                </div>
                <ArrowRight className="w-4 h-4 text-teal-400" />
              </button>
            ))}
          </div>
        )}

        {!checking && sucursales.length === 0 && (
          <p className="text-sm text-amber-400 text-center">No tenés ninguna sucursal asignada. Contactá a un administrador.</p>
        )}

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 mt-6 pt-4 border-t border-surface2 text-xs text-muted hover:text-red-400 transition"
        >
          <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
};
