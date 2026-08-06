import { create } from 'zustand';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'VENDEDOR' | 'SOLO_CONSULTA';
}

export interface Sucursal {
  id: number;
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  ptoVtaArca: number;
  ticketWidth: number;
  printerInterface: string;
  printerAddress: string;
  activa: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  sucursales: Sucursal[];
  activeSucursal: Sucursal | null;
  setAuth: (user: User, token: string, sucursales: Sucursal[], activeSucursal: Sucursal | null) => void;
  setActiveSucursal: (sucursal: Sucursal, token: string) => void;
  syncSucursales: (user: User, sucursales: Sucursal[]) => void;
  logout: () => void;
}

const savedUser = localStorage.getItem('full_clean_user');
const savedToken = localStorage.getItem('full_clean_token');
const savedSucursales = localStorage.getItem('full_clean_sucursales');
const savedActiveSucursal = localStorage.getItem('full_clean_active_sucursal');

export const useAuthStore = create<AuthState>((set) => ({
  user: savedUser ? JSON.parse(savedUser) : null,
  token: savedToken || null,
  sucursales: savedSucursales ? JSON.parse(savedSucursales) : [],
  activeSucursal: savedActiveSucursal ? JSON.parse(savedActiveSucursal) : null,

  setAuth: (user, token, sucursales, activeSucursal) => {
    localStorage.setItem('full_clean_user', JSON.stringify(user));
    localStorage.setItem('full_clean_token', token);
    localStorage.setItem('full_clean_sucursales', JSON.stringify(sucursales));
    if (activeSucursal) {
      localStorage.setItem('full_clean_active_sucursal', JSON.stringify(activeSucursal));
    } else {
      localStorage.removeItem('full_clean_active_sucursal');
    }
    set({ user, token, sucursales, activeSucursal });
  },

  setActiveSucursal: (sucursal, token) => {
    localStorage.setItem('full_clean_active_sucursal', JSON.stringify(sucursal));
    localStorage.setItem('full_clean_token', token);
    set({ activeSucursal: sucursal, token });
  },

  // Refresca la lista de sucursales desde el servidor (GET /auth/me) sin tocar el token.
  // Necesario porque un token de una sesión anterior a esta funcionalidad no trae sucursales
  // en localStorage, y sin esto el usuario queda trabado en la pantalla de selección.
  syncSucursales: (user, sucursales) => {
    localStorage.setItem('full_clean_user', JSON.stringify(user));
    localStorage.setItem('full_clean_sucursales', JSON.stringify(sucursales));
    set({ user, sucursales });
  },

  logout: () => {
    localStorage.removeItem('full_clean_user');
    localStorage.removeItem('full_clean_token');
    localStorage.removeItem('full_clean_sucursales');
    localStorage.removeItem('full_clean_active_sucursal');
    set({ user: null, token: null, sucursales: [], activeSucursal: null });
  },
}));
