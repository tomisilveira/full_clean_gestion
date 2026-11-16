import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { ThemeToggle } from './ThemeToggle';
import { ArrowLeft } from 'lucide-react';

export interface LegalInfo {
  businessName: string;
  cuit: string;
  address: string;
  phone: string;
  email: string;
}

// Datos de contacto de la empresa (endpoint público: las páginas legales se leen sin login).
export function useLegalInfo() {
  return useQuery<LegalInfo>({
    queryKey: ['legalInfo'],
    queryFn: async () => (await api.get('/public/legal')).data,
    staleTime: 5 * 60 * 1000,
  });
}

// Enlaces legales + contacto de soporte. Se usa al pie de las páginas públicas, del login
// y del menú lateral.
export const LegalLinks: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { data } = useLegalInfo();
  const linkCls = 'hover:text-accent underline-offset-2 hover:underline';
  return (
    <nav aria-label="Información legal y soporte" className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${className}`}>
      <Link to="/privacidad" className={linkCls}>Privacidad</Link>
      <Link to="/terminos" className={linkCls}>Términos</Link>
      <Link to="/proveedores" className={linkCls}>Proveedores de datos</Link>
      {data?.email && (
        <a href={`mailto:${data.email}?subject=Soporte%20-%20Full%20Clean`} className={linkCls}>Soporte</a>
      )}
    </nav>
  );
};

// Estructura común de las páginas públicas (privacidad, términos, proveedores).
export const LegalLayout: React.FC<{ title: string; updated?: string; children: React.ReactNode }> = ({
  title,
  updated,
  children,
}) => (
  <div className="min-h-screen bg-app text-body">
    <header className="border-b border-surface2 bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm text-secondary hover:text-accent">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
          <span className="font-semibold text-heading">Full Clean</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>

    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-heading">{title}</h1>
      {updated && <p className="text-xs text-muted mt-1">Última actualización: {updated}</p>}
      <div className="mt-6 space-y-6 text-sm leading-relaxed">{children}</div>
    </main>

    <footer className="border-t border-surface2 py-6 text-xs text-muted">
      <LegalLinks />
    </footer>
  </div>
);

export const Section: React.FC<{ id?: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section id={id} className="space-y-2">
    <h2 className="text-base font-bold text-heading">{title}</h2>
    {children}
  </section>
);
