// Workaround: en el build de Render (Linux) TypeScript no encuentra la declaración de tipos
// para el subpath "react-dom/client" pese a que @types/react-dom la incluye y localmente
// (Windows) resuelve bien. El archivo JS real existe y funciona en runtime; esto solo le
// da a TS una firma mínima para no romper el type-check en ese entorno.
declare module 'react-dom/client' {
  import type { Container } from 'react-dom';
  import type { ReactNode } from 'react';

  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Container, options?: unknown): Root;
  export function hydrateRoot(container: Container, children: ReactNode, options?: unknown): Root;
}
