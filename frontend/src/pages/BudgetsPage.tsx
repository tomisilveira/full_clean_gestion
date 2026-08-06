import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { FileText, Plus, FileDown, CheckCircle, ArrowRight } from 'lucide-react';

export const BudgetsPage: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('Consumidor Final');
  const [budgetItems, setBudgetItems] = useState<any[]>([]);

  const queryClient = useQueryClient();

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['budgets'],
    queryFn: async () => (await api.get('/budgets')).data,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data,
  });

  const createBudgetMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post('/budgets', {
          customerId: selectedCustomerId ? parseInt(selectedCustomerId) : null,
          customerName,
          items: budgetItems,
        })
      ).data;
    },
    onSuccess: () => {
      setIsCreateModalOpen(false);
      setBudgetItems([]);
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  const convertBudgetMutation = useMutation({
    mutationFn: async (budgetId: number) => {
      return (await api.post(`/budgets/${budgetId}/convert`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  const handleAddItem = (productId: number) => {
    const prod = products.find((p: any) => p.id === productId);
    if (!prod) return;

    setBudgetItems([
      ...budgetItems,
      {
        productId: prod.id,
        quantity: 1,
        unitPrice: prod.salePrice,
        name: prod.name,
      },
    ]);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <FileText className="w-7 h-7 text-teal-400" />
            Presupuestos y Cotizaciones
          </h1>
          <p className="text-xs text-secondary mt-1">
            Confección de cotizaciones, exportación a PDF y conversión directa en ventas.
          </p>
        </div>

        <button
          onClick={() => {
            setBudgetItems([]);
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Presupuesto</span>
        </button>
      </div>

      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">Nº Presupuesto</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Fecha Emisión</th>
                <th className="p-4">Válido Hasta</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">
                    Cargando presupuestos...
                  </td>
                </tr>
              ) : budgets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted">
                    No hay presupuestos creados.
                  </td>
                </tr>
              ) : (
                budgets.map((b: any) => (
                  <tr key={b.id} className="hover:bg-surface2/40 transition">
                    <td className="p-4 font-mono text-xs font-bold text-teal-400">{b.budgetNumber}</td>
                    <td className="p-4 text-heading font-medium">{b.customerName}</td>
                    <td className="p-4 text-xs text-secondary">{new Date(b.createdAt).toLocaleDateString('es-AR')}</td>
                    <td className="p-4 text-xs text-secondary">{new Date(b.validUntil).toLocaleDateString('es-AR')}</td>
                    <td className="p-4 text-right font-mono font-bold text-heading">${b.total.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          b.status === 'CONVERTED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-surface2 text-secondary'
                        }`}
                      >
                        {b.status === 'CONVERTED' ? 'CONVERTIDO A VENTA' : 'BORRADOR'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <a
                          href={`/api/budgets/${b.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title="Descargar PDF"
                          className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-teal-400 transition"
                        >
                          <FileDown className="w-4 h-4" />
                        </a>

                        {b.status !== 'CONVERTED' && (
                          <button
                            onClick={() => convertBudgetMutation.mutate(b.id)}
                            title="Convertir a Venta"
                            className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600 text-accent hover:text-white text-xs font-semibold rounded-lg transition flex items-center space-x-1"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Convertir</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE BUDGET MODAL */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Nuevo Presupuesto" maxWidth="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createBudgetMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Cliente</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                const cust = customers.find((c: any) => c.id === parseInt(e.target.value));
                if (cust) setCustomerName(cust.name);
              }}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
            >
              <option value="">Consumidor Final</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Agregar Producto</label>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleAddItem(parseInt(e.target.value));
                  e.target.value = '';
                }
              }}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
            >
              <option value="">-- Seleccionar producto --</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} (${p.salePrice.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* Budget items list */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {budgetItems.map((item, idx) => (
              <div key={idx} className="flex items-center space-x-3 bg-surface2/60 p-2.5 rounded-lg border border-surface3 text-xs">
                <div className="flex-1 font-bold text-heading">{item.name}</div>
                <div className="w-20">
                  <span className="text-[10px] text-secondary block">Cant.</span>
                  <input
                    type="number"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const updated = [...budgetItems];
                      updated[idx].quantity = parseFloat(e.target.value || '0');
                      setBudgetItems(updated);
                    }}
                    className="w-full bg-surface border border-surface3 rounded px-2 py-1 font-mono text-heading"
                  />
                </div>
                <div className="w-24">
                  <span className="text-[10px] text-secondary block">Precio Unit.</span>
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => {
                      const updated = [...budgetItems];
                      updated[idx].unitPrice = parseFloat(e.target.value || '0');
                      setBudgetItems(updated);
                    }}
                    className="w-full bg-surface border border-surface3 rounded px-2 py-1 font-mono text-heading"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
            <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={createBudgetMutation.isPending || budgetItems.length === 0} className="px-5 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm">
              Crear Presupuesto
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
