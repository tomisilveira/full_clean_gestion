import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { openManualInvoicePdf } from '../utils/tickets';
import { toastSuccess } from '../store/useToastStore';
import { FilePlus2, Plus, Trash2, FileDown, Zap, ShieldAlert } from 'lucide-react';

const CBTE_TIPO_LABELS: Record<number, string> = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C' };

interface FreeItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export const ManualInvoicesPage: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FreeItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);

  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['manualInvoices'],
    queryFn: async () => (await api.get('/manual-invoices')).data,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });

  const total = items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unitPrice || 0), 0);

  const resetForm = () => {
    setSelectedCustomerId('');
    setCustomerName('');
    setNotes('');
    setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post('/manual-invoices', {
          customerId: selectedCustomerId ? parseInt(selectedCustomerId) : null,
          customerName,
          items,
          notes,
        })
      ).data;
    },
    onSuccess: () => {
      setIsCreateModalOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['manualInvoices'] });
      toastSuccess('Factura libre guardada. Ahora podés emitir el comprobante ARCA.');
    },
  });

  const emitInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: number) => (await api.post(`/arca/invoice/manual/${invoiceId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manualInvoices'] });
      toastSuccess('Comprobante ARCA emitido correctamente.');
    },
  });

  const updateItem = (idx: number, field: keyof FreeItem, value: any) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const addItemRow = () => setItems([...items, { description: '', quantity: 1, unitPrice: 0 }]);
  const removeItemRow = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const validItems = items.filter((it) => it.description.trim() && it.quantity > 0 && it.unitPrice >= 0);
  const canSubmit = validItems.length === items.length && items.length > 0 && (selectedCustomerId || customerName.trim());

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <FilePlus2 className="w-7 h-7 text-amber-400" />
            Facturación Libre
          </h1>
          <p className="text-xs text-secondary mt-1">
            Comprobantes ARCA para operaciones fuera del catálogo de este sistema: no descuentan stock ni se
            vinculan a ninguna venta o presupuesto cargado.
          </p>
        </div>

        <button
          onClick={() => { resetForm(); setIsCreateModalOpen(true); }}
          className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Factura Libre</span>
        </button>
      </div>

      <div className="p-3 bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs rounded-xl flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Los ítems y montos acá son de texto libre, sin relación con el stock. Usalo solo para facturar algo que
          realmente entregaste por fuera de este sistema — no para redescribir una venta que ya está cargada acá.
        </span>
      </div>

      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">Fecha</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Notas</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-center">Comprobante ARCA</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted">Cargando...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted">Todavía no hay facturas libres creadas.</td></tr>
              ) : (
                invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-surface2/40 transition">
                    <td className="p-4 text-xs text-secondary">{new Date(inv.createdAt).toLocaleString('es-AR')}</td>
                    <td className="p-4 text-heading font-medium">{inv.customerName}</td>
                    <td className="p-4 text-xs text-secondary max-w-xs truncate">{inv.notes || '-'}</td>
                    <td className="p-4 text-right font-mono font-bold text-heading">${inv.total.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      {inv.invoiceARCA ? (
                        <div className="text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                            {CBTE_TIPO_LABELS[inv.invoiceARCA.cbteTipo] || 'Emitida'}
                          </span>
                          <div className="text-[10px] font-mono text-secondary mt-1">CAE {inv.invoiceARCA.cae}</div>
                        </div>
                      ) : (
                        <button
                          onClick={() => emitInvoiceMutation.mutate(inv.id)}
                          disabled={emitInvoiceMutation.isPending}
                          className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600 text-accent hover:text-white text-xs font-semibold rounded-lg transition inline-flex items-center gap-1"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Emitir Factura ARCA
                        </button>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => openManualInvoicePdf(inv.id)}
                        title="Descargar PDF"
                        className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-amber-400 transition"
                      >
                        <FileDown className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MANUAL INVOICE MODAL */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Nueva Factura Libre" maxWidth="lg">
        <form onSubmit={(e) => { e.preventDefault(); createInvoiceMutation.mutate(); }} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Cliente</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                const cust = customers.find((c: any) => c.id === parseInt(e.target.value));
                if (cust) setCustomerName(cust.name);
              }}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-amber-500"
            >
              <option value="">-- Cliente no registrado (escribir nombre abajo) --</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} {c.cuitDni ? `(${c.cuitDni})` : ''}</option>
              ))}
            </select>
          </div>

          {!selectedCustomerId && (
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Nombre / Razón Social *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre del cliente"
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-body">Ítems a Facturar</label>
              <button type="button" onClick={addItemRow} className="text-xs text-amber-400 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Agregar Ítem
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 bg-surface2/60 p-2.5 rounded-lg border border-surface3">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                  placeholder="Descripción"
                  className="flex-1 bg-surface border border-surface3 rounded px-2 py-1.5 text-xs text-heading focus:outline-none"
                />
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value || '0'))}
                  placeholder="Cant."
                  className="w-16 bg-surface border border-surface3 rounded px-2 py-1.5 text-xs text-heading font-mono focus:outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value || '0'))}
                  placeholder="Precio"
                  className="w-24 bg-surface border border-surface3 rounded px-2 py-1.5 text-xs text-heading font-mono focus:outline-none"
                />
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItemRow(idx)} className="p-1.5 text-muted hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Notas (opcional, uso interno)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-surface2">
            <div className="text-sm">
              <span className="text-secondary">Total:</span>{' '}
              <span className="font-mono font-bold text-heading text-lg">${total.toFixed(2)}</span>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={!canSubmit || createInvoiceMutation.isPending} className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm disabled:opacity-50">
                Guardar Factura
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
