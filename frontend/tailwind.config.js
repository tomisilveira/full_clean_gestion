/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta extraída del logo real (frontend/public/logo.png): azules de la gota + cian de las burbujas.
        brand: {
          50: '#eaf6fc',
          100: '#cfeaf7',
          300: '#7fc8ea',
          400: '#5cd9e6', // cian brillante (burbujas)
          500: '#46a6d8', // azul principal del cuerpo de la gota
          600: '#2e8fc5',
          700: '#1478b3', // azul oscuro (base/anillo)
          900: '#2a3c8e', // navy (punto de acento)
        },
        // Paleta semántica de neutros: los valores reales se definen como variables CSS
        // en index.css (:root para claro, .dark para oscuro), así una sola clase
        // (ej. "bg-surface") funciona en ambos temas sin necesidad de variantes dark:.
        app: 'rgb(var(--color-app) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surface2: 'rgb(var(--color-surface2) / <alpha-value>)',
        surface3: 'rgb(var(--color-surface3) / <alpha-value>)',
        heading: 'rgb(var(--color-heading) / <alpha-value>)',
        body: 'rgb(var(--color-body) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        faint: 'rgb(var(--color-faint) / <alpha-value>)',
        accent: 'rgb(var(--color-accent-text) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
