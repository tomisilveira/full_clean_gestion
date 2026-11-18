import React, { useLayoutEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore } from '../store/useToastStore';

// Montado una sola vez en App.tsx. Antes, cuando una mutación (guardar cliente, cargar
// compra, crear presupuesto, etc.) fallaba, no había ningún feedback visual: el modal
// se quedaba tal cual y parecía que "no pasaba nada". Este componente + los onError de
// cada mutation.mutate() son lo que soluciona eso.
export const Toaster: React.FC = () => {
  const { toasts, removeToast } = useToastStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastToastId = toasts[toasts.length - 1]?.id;

  // Los <dialog> abiertos con showModal() viven en la "top layer" del navegador, que queda por
  // encima de CUALQUIER z-index: un aviso común (z-[100]) quedaba detrás del fondo oscuro y
  // borroso del modal, justo cuando más importa verlo (ej. falla un guardado dentro de un modal).
  // Mostrando el contenedor como popover manual también entra a la top layer, y se lo vuelve a
  // abrir con cada aviso nuevo para que quede por encima del modal. En navegadores sin soporte de
  // popover el atributo se ignora y sigue funcionando el z-index de siempre.
  useLayoutEffect(() => {
    const el = containerRef.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el || typeof el.showPopover !== 'function') return;
    try {
      if (el.matches(':popover-open')) el.hidePopover?.();
      el.showPopover();
    } catch {
      // si el navegador no puede abrirlo, queda visible igual por z-index
    }
  }, [lastToastId]);

  if (toasts.length === 0) return null;

  return (
    <div
      ref={containerRef}
      {...({ popover: 'manual' } as object)}
      role="region"
      aria-label="Avisos"
      aria-live="polite"
      className="fixed top-4 right-4 left-auto bottom-auto z-[100] m-0 p-0 border-0 bg-transparent overflow-visible flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm"
    >
      {toasts.map((toast) => {
        const styles =
          toast.type === 'error'
            ? 'bg-red-950/95 border-red-800 text-red-200'
            : toast.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-800 text-emerald-200'
            : 'bg-surface border-surface2 text-body';
        const Icon = toast.type === 'error' ? AlertTriangle : toast.type === 'success' ? CheckCircle2 : Info;

        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2.5 p-3.5 rounded-xl border shadow-2xl backdrop-blur-sm animate-fade-in ${styles}`}
          >
            <Icon className="w-4.5 h-4.5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button onClick={() => removeToast(toast.id)} className="shrink-0 opacity-70 hover:opacity-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
