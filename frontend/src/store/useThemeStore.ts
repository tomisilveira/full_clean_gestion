import { create } from 'zustand';

export type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('full_clean_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  // Sin preferencia guardada todavía: siempre arranca en claro (no se detecta el
  // tema del sistema operativo). El botón de la Navbar sigue cambiándolo y esa
  // elección se recuerda a partir de ahí.
  return 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const initial = getInitialTheme();
applyTheme(initial);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial,
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('full_clean_theme', next);
    applyTheme(next);
    set({ theme: next });
  },
  setTheme: (theme) => {
    localStorage.setItem('full_clean_theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));
