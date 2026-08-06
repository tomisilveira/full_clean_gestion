import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { useAuthStore } from '../store/useAuthStore';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Edit2,
  ArrowDownUp,
  ArrowRightLeft,
  Tag,
  CheckCircle,
} from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const { user, sucursales, activeSucursal } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [selectedProductForMovement, setSelectedProductForMovement] = useState<any>(null);
  const [selectedProductForTransfer, setSelectedProductForTransfer] = useState<any>(null);

  // Form states for Transfer
  const [transferToId, setTransferToId] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferReason, setTransferReason] = useState('');

  // Form states for Product Create/Edit
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState('UN');
  const [costPrice, setCostPrice] = useState('');
  const [profitMargin, setProfitMargin] = useState('30');
  const [salePrice, setSalePrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [currentStock, setCurrentStock] = useState('0');

  // Form states for Movement
  const [movementType, setMovementType] = useState<'MANUAL_IN' | 'MANUAL_OUT'>('MANUAL_IN');
  const [movementQty, setMovementQty] = useState('');
  const [movementReason, setMovementReason] = useState('');

  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search, selectedCategory],
    queryFn: async () => {
      const res = await api.get('/products', {
        params: { search, categoryId: selectedCategory || undefined },
      });
      return res.data;
    },
  });

  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['lowStockProducts'],
    queryFn: async () => (await api.get('/products/low-stock')).data,
  });

  // Calculate sale price when cost or margin changes
  const handleCostOrMarginChange = (newCost: string, newMargin: string) => {
    const cost = parseFloat(newCost) || 0;
    const margin = parseFloat(newMargin) || 0;
    if (cost > 0) {
      const calculatedSale = cost * (1 + margin / 100);
      setSalePrice(calculatedSale.toFixed(2));
      setWholesalePrice((calculatedSale * 0.85).toFixed(2));
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setCode('');
    setName('');
    setDescription('');
    setCategoryId('');
    setUnit('UN');
    setCostPrice('');
    setProfitMargin('30');
    setSalePrice('');
    setWholesalePrice('');
    setMinStock('5');
    setCurrentStock('0');
    setIsProductModalOpen(true);
  };

  const openEditModal = (prod: any) => {
    setEditingProduct(prod);
    setCode(prod.code);
    setName(prod.name);
    setDescription(prod.description || '');
    setCategoryId(prod.categoryId ? prod.categoryId.toString() : '');
    setUnit(prod.unit);
    setCostPrice(prod.costPrice.toString());
    setProfitMargin(prod.profitMargin.toString());
    setSalePrice(prod.salePrice.toString());
    setWholesalePrice(prod.wholesalePrice.toString());
    setMinStock(prod.minStock.toString());
    setCurrentStock(prod.currentStock.toString());
    setIsProductModalOpen(true);
  };

  const saveProductMutation = useMutation({
    mutationFn: async () => {
      if (editingProduct) {
        // Datos globales del catálogo (no incluyen stock, que es por sucursal)
        const result = await api.put(`/products/${editingProduct.id}`, {
          code,
          name,
          description,
          categoryId: categoryId ? parseInt(categoryId) : null,
          unit,
          costPrice: parseFloat(costPrice || '0'),
          profitMargin: parseFloat(profitMargin || '30'),
          salePrice: parseFloat(salePrice || '0'),
          wholesalePrice: parseFloat(wholesalePrice || '0'),
        });
        // El stock mínimo es específico de la sucursal activa
        await api.put(`/products/${editingProduct.id}/min-stock`, { minStock: parseFloat(minStock || '5') });
        return result.data;
      } else {
        const payload = {
          code,
          name,
          description,
          categoryId: categoryId ? parseInt(categoryId) : null,
          unit,
          costPrice: parseFloat(costPrice || '0'),
          profitMargin: parseFloat(profitMargin || '30'),
          salePrice: parseFloat(salePrice || '0'),
          wholesalePrice: parseFloat(wholesalePrice || '0'),
          minStock: parseFloat(minStock || '5'),
          currentStock: parseFloat(currentStock || '0'),
        };
        return (await api.post('/products', payload)).data;
      }
    },
    onSuccess: () => {
      setIsProductModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });

  const saveMovementMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`/products/${selectedProductForMovement.id}/movement`, {
          type: movementType,
          quantity: parseFloat(movementQty),
          reason: movementReason,
        })
      ).data;
    },
    onSuccess: () => {
      setIsMovementModalOpen(false);
      setMovementQty('');
      setMovementReason('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`/products/${selectedProductForTransfer.id}/transfer`, {
          fromSucursalId: activeSucursal?.id,
          toSucursalId: parseInt(transferToId),
          quantity: parseFloat(transferQty),
          reason: transferReason,
        })
      ).data;
    },
    onSuccess: () => {
      setIsTransferModalOpen(false);
      setTransferToId('');
      setTransferQty('');
      setTransferReason('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['lowStockProducts'] });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <Package className="w-7 h-7 text-teal-400" />
            Stock e Inventario
          </h1>
          <p className="text-xs text-secondary mt-1">
            Gestión completa de productos, precios, alertas de stock mínimo y ajustes manuales.
            {' '}Stock mostrado: <span className="text-teal-400 font-semibold">{activeSucursal?.nombre}</span>.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center space-x-2 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Producto</span>
        </button>
      </div>

      {/* Low Stock Alert Banner if any */}
      {lowStockProducts.length > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-2xl flex items-center justify-between text-amber-300">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-sm font-medium">
              ¡Atención! Hay <strong>{lowStockProducts.length}</strong> producto(s) con stock igual o inferior al mínimo configurado.
            </span>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código de barras, nombre o descripción..."
            className="w-full bg-surface border border-surface2 rounded-xl pl-9 pr-4 py-2.5 text-sm text-heading placeholder-muted focus:outline-none focus:border-teal-500"
          />
        </div>

        <select
          value={selectedCategory || ''}
          onChange={(e) => setSelectedCategory(e.target.value ? parseInt(e.target.value) : null)}
          className="bg-surface border border-surface2 rounded-xl px-4 py-2.5 text-sm text-heading focus:outline-none focus:border-teal-500"
        >
          <option value="">Todas las Categorías</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Products Table */}
      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">Código</th>
                <th className="p-4">Producto</th>
                <th className="p-4">Categoría</th>
                <th className="p-4 text-right">Costo</th>
                <th className="p-4 text-right">P. Venta</th>
                <th className="p-4 text-right">P. Mayorista</th>
                <th className="p-4 text-center">Stock Actual</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted">
                    Cargando productos del inventario...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted">
                    No se encontraron productos registrados.
                  </td>
                </tr>
              ) : (
                products.map((prod: any) => {
                  const isLow = prod.currentStock <= prod.minStock;
                  return (
                    <tr key={prod.id} className="hover:bg-surface2/40 transition">
                      <td className="p-4 font-mono text-xs text-teal-400 font-bold">{prod.code}</td>
                      <td className="p-4">
                        <div className="font-semibold text-heading">{prod.name}</div>
                        {prod.description && <div className="text-xs text-muted">{prod.description}</div>}
                      </td>
                      <td className="p-4 text-secondary">{prod.category?.name || 'Sin Categoría'}</td>
                      <td className="p-4 text-right font-mono">${prod.costPrice.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono font-bold text-heading">${prod.salePrice.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono text-secondary">${prod.wholesalePrice.toFixed(2)}</td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                            isLow
                              ? 'bg-red-950/80 border border-red-800 text-red-400'
                              : 'bg-emerald-950/80 border border-emerald-800 text-emerald-400'
                          }`}
                        >
                          {prod.currentStock} {prod.unit}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => {
                              setSelectedProductForMovement(prod);
                              setMovementType('MANUAL_IN');
                              setIsMovementModalOpen(true);
                            }}
                            title="Ajustar Stock"
                            className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-teal-400 transition"
                          >
                            <ArrowDownUp className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => openEditModal(prod)}
                            title="Editar Producto"
                            className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-body transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {isAdmin && sucursales.length > 1 && (
                            <button
                              onClick={() => {
                                setSelectedProductForTransfer(prod);
                                setTransferToId('');
                                setIsTransferModalOpen(true);
                              }}
                              title="Transferir a otra sucursal"
                              className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-sky-400 transition"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT PRODUCT MODAL */}
      <Modal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        title={editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
        maxWidth="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveProductMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Código de Barras *</label>
              <input
                type="text"
                required
                placeholder="7791234567890"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Nombre del Producto *</label>
              <input
                type="text"
                required
                placeholder="Detergente Concentrado 5L"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Categoría</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="">Sin Categoría</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Unidad de Medida</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="UN">Unidad (UN)</option>
                <option value="LTS">Litros (LTS)</option>
                <option value="KG">Kilogramos (KG)</option>
                <option value="PACK">Pack / Bulto</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Precio Costo ($)</label>
              <input
                type="number"
                step="0.01"
                value={costPrice}
                onChange={(e) => {
                  setCostPrice(e.target.value);
                  handleCostOrMarginChange(e.target.value, profitMargin);
                }}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Margen Ganancia (%)</label>
              <input
                type="number"
                step="1"
                value={profitMargin}
                onChange={(e) => {
                  setProfitMargin(e.target.value);
                  handleCostOrMarginChange(costPrice, e.target.value);
                }}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">P. Venta Final ($) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-teal-400 font-bold font-mono focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">P. Venta Mayorista ($)</label>
              <input
                type="number"
                step="0.01"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Stock Mínimo Alerta</label>
              <input
                type="number"
                step="1"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            {!editingProduct && (
              <div>
                <label className="block text-xs font-semibold text-body mb-1">Stock Inicial</label>
                <input
                  type="number"
                  step="1"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(e.target.value)}
                  className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-surface2">
            <button
              type="button"
              onClick={() => setIsProductModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-surface2 hover:bg-surface3 text-body text-sm font-medium transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveProductMutation.isPending}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-lg shadow-teal-500/20 transition disabled:opacity-50"
            >
              {saveProductMutation.isPending ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ADJUST STOCK MOVEMENT MODAL */}
      {selectedProductForMovement && (
        <Modal
          isOpen={isMovementModalOpen}
          onClose={() => setIsMovementModalOpen(false)}
          title={`Ajuste Manual de Stock: ${selectedProductForMovement.name}`}
          maxWidth="md"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMovementMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Tipo de Movimiento</label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as any)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="MANUAL_IN">Ingreso (+) / Ajuste Positivo</option>
                <option value="MANUAL_OUT">Egreso (-) / Merma / Rotura</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Cantidad *</label>
              <input
                type="number"
                step="1"
                required
                placeholder="10"
                value={movementQty}
                onChange={(e) => setMovementQty(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Motivo u Observación</label>
              <input
                type="text"
                placeholder="Ej: Recuento de depósito, botella rota, etc."
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
              <button
                type="button"
                onClick={() => setIsMovementModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface2 hover:bg-surface3 text-body text-sm font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saveMovementMutation.isPending}
                className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-lg shadow-teal-500/20 transition disabled:opacity-50"
              >
                {saveMovementMutation.isPending ? 'Guardando...' : 'Confirmar Ajuste'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* TRANSFER STOCK BETWEEN SUCURSALES MODAL */}
      {selectedProductForTransfer && (
        <Modal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          title={`Transferir Stock: ${selectedProductForTransfer.name}`}
          maxWidth="md"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              transferMutation.mutate();
            }}
            className="space-y-4"
          >
            <p className="text-xs text-secondary">
              Desde <span className="font-semibold text-teal-400">{activeSucursal?.nombre}</span> (stock actual:{' '}
              {selectedProductForTransfer.currentStock} {selectedProductForTransfer.unit}) hacia:
            </p>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Sucursal de Destino *</label>
              <select
                required
                value={transferToId}
                onChange={(e) => setTransferToId(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="">Seleccionar sucursal...</option>
                {sucursales.filter((s) => s.id !== activeSucursal?.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Cantidad *</label>
              <input
                type="number"
                step="1"
                required
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Motivo</label>
              <input
                type="text"
                placeholder="Ej: Reposición por pedido del local"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              />
            </div>

            {(transferMutation.error as any) && (
              <p className="text-xs text-red-400">
                {(transferMutation.error as any)?.response?.data?.error || 'Error al transferir stock.'}
              </p>
            )}

            <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface2 hover:bg-surface3 text-body text-sm font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={transferMutation.isPending}
                className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold shadow-lg shadow-sky-500/20 transition disabled:opacity-50"
              >
                {transferMutation.isPending ? 'Transfiriendo...' : 'Confirmar Transferencia'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
