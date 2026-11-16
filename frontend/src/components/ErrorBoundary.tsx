import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportClientError } from '../utils/reportError';

interface State {
  hasError: boolean;
}

// Red de seguridad de la interfaz: si un componente lanza un error al renderizar, sin esto
// React desmonta todo el árbol y queda la pantalla en blanco sin explicación.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Error de interfaz no controlado:', error, info.componentStack);
    reportClientError(error, info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="min-h-screen bg-app flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-950/40 flex items-center justify-center mb-4" aria-hidden="true">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold text-heading">Algo salió mal</h1>
        <p className="text-sm text-secondary mt-2 max-w-sm">
          Ocurrió un error inesperado en la pantalla. Tus datos no se perdieron. Recargá la página para continuar;
          si el problema se repite, avisá a soporte.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition"
        >
          Recargar página
        </button>
      </div>
    );
  }
}
