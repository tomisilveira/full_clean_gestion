import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { api } from '../services/api';

interface QuickBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedCode: string;
  onSuccess: (newProduct: any) => void;
}

export const QuickBarcodeModal: React.FC<QuickBarcodeModalProps> = ({
  isOpen,
  onClose,
  scannedCode,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [currentStock, setCurrentStock] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setSalePrice('');
      setCurrentStock('10');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !salePrice) {
      setError('Por favor complete el nombre y precio de venta.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/products/quick-barcode', {
        code: scannedCode,
        name: name.trim(),
        salePrice: parseFloat(salePrice),
        currentStock: parseFloat(currentStock || '1'),
      });
      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al registrar el nuevo producto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚡ Alta Rápida de Producto Escaneado">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-xs">
          El código de barras <span className="font-mono font-bold text-amber-200">{scannedCode}</span> no está registrado. Ingrese los datos básicos para agregarlo inmediatamente a la venta.
        </div>

        {error && <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-lg">{error}</div>}

        <div>
          <label className="block text-xs font-semibold text-body mb-1">Código de Barras</label>
          <input
            type="text"
            value={scannedCode}
            disabled
            className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-secondary font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-body mb-1">Nombre del Producto *</label>
          <input
            type="text"
            required
            autoFocus
            placeholder="Ej: Desengrasante Multiuso 1L"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Precio de Venta ($) *</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Stock Inicial</label>
            <input
              type="number"
              step="1"
              value={currentStock}
              onChange={(e) => setCurrentStock(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface2 hover:bg-surface3 text-body text-sm font-medium transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-lg shadow-teal-500/20 transition disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar y Agregar a Venta'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
