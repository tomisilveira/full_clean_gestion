import React from 'react';
import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { LegalLinks } from '../components/LegalLayout';

// Antes cualquier ruta inexistente redirigía en silencio a "/", lo que escondía links rotos
// y no le explicaba nada a quien tipeó mal la dirección.
export const NotFoundPage: React.FC = () => (
  <div className="min-h-screen bg-app flex flex-col items-center justify-center p-4 text-center">
    <div className="w-16 h-16 rounded-2xl bg-surface2 flex items-center justify-center mb-4" aria-hidden="true">
      <SearchX className="w-8 h-8 text-muted" />
    </div>
    <p className="text-sm font-semibold text-accent">Error 404</p>
    <h1 className="text-2xl font-bold text-heading mt-1">No encontramos esa página</h1>
    <p className="text-sm text-secondary mt-2 max-w-sm">
      La dirección no existe o fue movida. Revisá que esté bien escrita o volvé al inicio.
    </p>
    <Link to="/" className="mt-6 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition">
      Volver al inicio
    </Link>
    <LegalLinks className="mt-10 text-xs text-muted" />
  </div>
);
