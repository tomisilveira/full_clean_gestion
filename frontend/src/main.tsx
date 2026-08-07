import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { App } from './App';
import { toastError } from './store/useToastStore';
import './store/useThemeStore'; // aplica el tema guardado (o el del sistema) antes del primer render
import './index.css';

const queryClient = new QueryClient({
  // MutationCache.onError corre SIEMPRE que una mutación falla, incluso si la página que
  // la dispara también define su propio onError — a diferencia de defaultOptions, que
  // solo aplica cuando la mutación no define nada propio. Antes, cuando el backend
  // rechazaba un guardado (cliente, compra, presupuesto, venta...) no había ningún
  // feedback visual: esto es lo que hace que cualquier error se vea, en cualquier pantalla.
  mutationCache: new MutationCache({
    onError: (error) => toastError(error),
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
