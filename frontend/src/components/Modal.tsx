import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

// Modal sobre <dialog> nativo abierto con showModal(): el navegador aporta el rol de diálogo,
// la contención del foco, el fondo inerte (ni clicks ni foco detrás, ni siquiera el F2 del POS),
// el cierre con Esc y la devolución del foco al botón que lo abrió. No hace falta reimplementar nada de eso.
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // El contenido se monta recién DESPUÉS de showModal(). React no deja el atributo autofocus en el DOM:
  // llama a .focus() al montar, y si el <dialog> todavía está cerrado ese focus se pierde.
  // Montando los hijos con el diálogo ya abierto, los autoFocus existentes (alta rápida por código
  // de barras, cambio de contraseña) siguen funcionando.
  const [contentMounted, setContentMounted] = useState(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) dialog.showModal();
      setContentMounted(true);
    } else {
      if (dialog.open) dialog.close();
      setContentMounted(false);
    }
  }, [isOpen]);

  // Se dispara con cualquier cierre: Esc / gesto de volver (nativo) o dialog.close() del efecto.
  // Solo avisamos al padre si el cierre vino del navegador, es decir, si para React seguía abierto.
  //
  // OJO: el navegador entrega el evento `close` de forma asíncrona. Si el modal se cerró por código
  // y se volvió a abrir enseguida (ej. "Nuevo" justo después de guardar), el `close` viejo puede llegar
  // cuando React ya tiene isOpen=true otra vez y cerraría el modal recién abierto. Por eso además se
  // verifica que el <dialog> esté realmente cerrado en este momento: un evento atrasado lo encuentra
  // abierto y se ignora.
  const handleNativeClose = () => {
    if (isOpen && !dialogRef.current?.open) onClose();
  };

  // Esc (o el gesto de volver en Android) dispara `cancel` ANTES de cerrar. Lo atajamos para que
  // sea React quien cierre: se cancela el cierre nativo y se avisa al padre en el acto; el efecto
  // de arriba llama a dialog.close() cuando isOpen pasa a false. Así el estado del padre no depende
  // de cuándo el navegador entregue el evento `close` (que puede llegar con retraso y dejar al
  // padre creyendo que el modal sigue abierto, con lo que un "Abrir" inmediato no hacía nada).
  const handleCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[maxWidth];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      className={`w-[calc(100%-2rem)] ${maxWidthClass} p-0 bg-surface text-heading border border-surface2 rounded-xl shadow-2xl overflow-hidden backdrop:bg-black/70 backdrop:backdrop-blur-sm`}
    >
      {contentMounted && (
        <>
          <div className="px-6 py-4 border-b border-surface2 flex items-center justify-between">
            <h3 id={titleId} className="text-lg font-bold text-heading">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1 rounded-lg text-secondary hover:text-heading hover:bg-surface2 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 max-h-[80vh] overflow-y-auto overscroll-contain">{children}</div>
        </>
      )}
    </dialog>
  );
};
