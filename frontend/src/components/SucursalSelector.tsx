import React, { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import type { Sucursal } from '../store/useAuthStore';

interface SucursalSelectorProps {
  sucursales: Sucursal[];
  activeSucursal: Sucursal | null;
  onSelect: (sucursalId: number) => void;
}

// Reemplaza el <select> nativo (que en algunos navegadores se ve con el estilo del
// sistema operativo, sin coherencia con el resto de la UI) por un dropdown propio,
// con la misma pill de siempre como disparador.
export const SucursalSelector: React.FC<SucursalSelectorProps> = ({
  sucursales,
  activeSucursal,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Con una sola sucursal disponible no hay nada para elegir: se muestra fija, sin flecha.
  if (sucursales.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border bg-sky-950/60 border-sky-800/80 text-sky-300">
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[10rem]">{activeSucursal?.nombre}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border bg-sky-950/60 border-sky-800/80 text-sky-300 hover:bg-sky-900/70 hover:border-sky-700 transition"
      >
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[8rem]">{activeSucursal?.nombre || 'Elegir sucursal'}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-2 w-64 py-1.5 rounded-xl border border-surface2 bg-surface shadow-xl shadow-black/20 z-50 overflow-hidden"
        >
          <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            Cambiar de sucursal
          </div>
          {sucursales.map((s) => {
            const isActive = s.id === activeSucursal?.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-left transition ${
                  isActive
                    ? 'text-accent bg-teal-600/10'
                    : 'text-body hover:bg-surface2/80 hover:text-heading'
                }`}
              >
                <span className="truncate">{s.nombre}</span>
                {isActive && <Check className="w-4 h-4 shrink-0 text-teal-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
