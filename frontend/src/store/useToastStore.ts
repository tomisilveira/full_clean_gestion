import { create } from 'zustand';

export interface Toast {
  id: number;
  type: 'error' | 'success' | 'info';
  message: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'error') => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
    // Auto-dismiss: los errores quedan más tiempo en pantalla que los éxitos.
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, type === 'error' ? 7000 : 4000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Extrae un mensaje legible de un error de axios (o de cualquier otro). El backend
// siempre responde { error: "..." } en los casos controlados; si no hay respuesta
// (caída de red, backend abajo) usamos el mensaje genérico de axios.
export function getErrorMessage(err: any): string {
  return err?.response?.data?.error || err?.message || 'Ocurrió un error inesperado.';
}

// Atajo para usar en onError de mutaciones de React Query: toastError(err)
export function toastError(err: any) {
  useToastStore.getState().addToast(getErrorMessage(err), 'error');
}

export function toastSuccess(message: string) {
  useToastStore.getState().addToast(message, 'success');
}
