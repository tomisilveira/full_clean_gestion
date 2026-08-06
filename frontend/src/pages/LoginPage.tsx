import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { Lock, User as UserIcon, Sparkles } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      setAuth(res.data.user, res.data.token, res.data.sucursales, res.data.activeSucursal);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-4 relative">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md bg-surface border border-surface2 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-600/20 border border-teal-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-teal-400 shadow-inner">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-heading">Full Clean Gestión</h1>
          <p className="text-sm text-secondary mt-1">Sistema de Negocio de Artículos de Limpieza</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-950/60 border border-red-800 text-red-300 text-sm rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-body mb-1.5">Usuario</label>
            <div className="relative">
              <UserIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin o vendedor"
                className="w-full bg-surface2/80 border border-surface3 rounded-xl pl-10 pr-4 py-2.5 text-sm text-heading focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1.5">Contraseña</label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface2/80 border border-surface3 rounded-xl pl-10 pr-4 py-2.5 text-sm text-heading focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-teal-500/25 transition disabled:opacity-50 mt-2"
          >
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-surface2/80 text-center text-xs text-muted space-y-1">
          <p>Credenciales de prueba iniciales:</p>
          <p className="font-mono text-secondary">admin / admin123 • vendedor / vendedor123</p>
        </div>
      </div>
    </div>
  );
};
