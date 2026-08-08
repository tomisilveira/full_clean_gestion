import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { openBudgetPdf, openTicketPreview } from '../utils/tickets';
import { toastSuccess } from '../store/useToastStore';
import { useAuthStore } from '../store/useAuthStore';
import { CARD_TYPES } from '../store/usePosStore';
import {
  FileText, Plus, FileDown, CheckCircle, ArrowRight, Trash2,
  AlertTriangle, Printer, CreditCard, ThumbsUp,
} from 'lucide-react';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'BORRADOR',
  APPROVED: 'APROBADO',
  CONVERTED: 'CONVERTIDO A VENTA',
  EXPIRED: 'VENCIDO',
};

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-surface2 text-secondary',
  APPROVED: 'bg-teal-950 text-teal-300 border border-teal-800',
  CONVERTED: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
  EXPIRED: 'bg-red-950 text-red-300 border border-red-800',
};

export const BudgetsPage: React.FC = () => {
  const { user } = useAuthStore();
  const canManage = user?.role === 'ADMIN' || user?.role === 'VENDEDOR';

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('Consumidor Final');
  const [budgetItems, setBudgetItems] = useState<any[]>([]);

  // Pase a venta (conversión)
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [convertingBudget, setConvertingBudget] = useState<any>(null);
  const [convertSaleType, setConvertSaleType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [convertDiscountType, setConvertDiscountType] = useState<'AMOUNT' | 'PERCENTAGE'>('AMOUNT');
  const [convertDiscountValue, setConvertDiscountValue] = useState(0);
  const [convertPayments, setConvertPayments] = useState<any[]>([{ paymentMethod: 'CASH', amount: 0 }]);
  const [convertedResult, setConvertedResult] = useState<any>(null); // { budget, sale }

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

  const { data: cashData } = useQuery({
    queryKey: ['currentCash'],
    queryFn: async () => (await api.get('/cash/current')).data,
  });
  const activeCashSession = cashData?.activeSession;

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
      toastSuccess('Presupuesto creado correctamente.');
    },
  });

  const approveBudgetMutation = useMutation({
    mutationFn: async (budgetId: number) => (await api.post(`/budgets/${budgetId}/approve`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      toastSuccess('Presupuesto marcado como aprobado por el cliente.');
    },
  });

  // Precio vigente en catálogo para un ítem del presupuesto, según el tipo de venta elegido
  // al convertir. El servidor SIEMPRE recalcula esto mismo al confirmar (nunca se cobra el
  // precio que haya quedado cotizado en el presupuesto): se muestra acá solo para que quien
  // cobra vea si el precio cambió desde que se armó el presupuesto, antes de cobrar.
  const priceForItem = (item: any) => {
    const prod = products.find((p: any) => p.id === item.productId);
    if (!prod) return item.unitPrice;
    return convertSaleType === 'WHOLESALE' ? (prod.wholesalePrice || prod.salePrice) : prod.salePrice;
  };

  const convertItems = convertingBudget ? convertingBudget.items.map((it: any) => {
    const currentPrice = priceForItem(it);
    return { ...it, currentPrice, currentSubtotal: currentPrice * it.quantity, priceChanged: Math.abs(currentPrice - it.unitPrice) > 0.005 };
  }) : [];
  const convertSubtotal = convertItems.reduce((sum: number, it: any) => sum + it.currentSubtotal, 0);
  const convertDiscountAmount = convertDiscountType === 'PERCENTAGE'
    ? Math.round(convertSubtotal * (Math.min(100, Math.max(0, convertDiscountValue || 0)) / 100) * 100) / 100
    : Math.max(0, convertDiscountValue || 0);
  const convertTotal = Math.max(0, convertSubtotal - convertDiscountAmount);

  const openConvertModal = (b: any) => {
    setConvertingBudget(b);
    setConvertSaleType('RETAIL');
    setConvertDiscountType('AMOUNT');
    setConvertDiscountValue(0);
    setConvertPayments([{ paymentMethod: 'CASH', amount: b.total }]);
    setIsConvertModalOpen(true);
  };

  // Recalcula el pago único (cuando hay uno solo) cada vez que cambia el tipo de venta o
  // el descuento, para que el monto sugerido siga el total actualizado sin que el usuario
  // tenga que hacer la cuenta a mano. Si ya armó un pago dividido en varios medios, no se
  // toca (podría pisar lo que estaba completando).
  React.useEffect(() => {
    if (convertPayments.length === 1) {
      setConvertPayments([{ ...convertPayments[0], amount: convertTotal }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convertSaleType, convertDiscountType, convertDiscountValue]);

  const handleAddConvertPayment = () => setConvertPayments([...convertPayments, { paymentMethod: 'CASH', amount: 0 }]);
  const handleUpdateConvertPayment = (idx: number, field: string, value: any) => {
    const updated = [...convertPayments];
    updated[idx] = { ...updated[idx], [field]: value };
    setConvertPayments(updated);
  };
  const handleRemoveConvertPayment = (idx: number) => setConvertPayments(convertPayments.filter((_, i) => i !== idx));

  const convertBudgetMutation = useMutation({
    mutationFn: async () => {
      const formattedPayments = convertPayments.map((p) => ({
        paymentMethod: p.paymentMethod,
        amount: p.amount,
        cardType: p.cardType,
        installments: p.installments,
      }));
      return (
        await api.post(`/budgets/${convertingBudget.id}/convert`, {
          payments: formattedPayments,
          discountType: convertDiscountType,
          discountValue: convertDiscountValue,
          saleType: convertSaleType,
        })
      ).data;
    },
    onSuccess: (data) => {
      setConvertedResult(data);
      setIsConvertModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
      toastSuccess('Presupuesto convertido en venta: se registró el cobro, el stock y la caja.');
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

      {canManage && !activeCashSession && (
        <div className="p-3 bg-amber-950/60 border border-amber-800 text-amber-300 text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Debe abrir la caja de esta sucursal para poder convertir un presupuesto en venta.</span>
        </div>
      )}

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
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_CLASS[b.status] || STATUS_CLASS.DRAFT}`}>
                        {STATUS_LABEL[b.status] || b.status}
                      </span>
                      {b.status === 'CONVERTED' && b.convertedSale && (
                        <div className="text-[10px] font-mono text-secondary mt-1">→ {b.convertedSale.saleNumber}</div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          type="button"
                          onClick={() => openBudgetPdf(b.id)}
                          title="Descargar PDF"
                          className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-teal-400 transition"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>

                        {canManage && b.status === 'DRAFT' && (
                          <button
                            onClick={() => approveBudgetMutation.mutate(b.id)}
                            disabled={approveBudgetMutation.isPending}
                            title="Marcar como Aprobado por el Cliente"
                            className="px-2.5 py-1 bg-surface2 hover:bg-teal-950 text-secondary hover:text-teal-300 text-xs font-semibold rounded-lg transition flex items-center space-x-1"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            <span>Aprobar</span>
                          </button>
                        )}

                        {canManage && (b.status === 'DRAFT' || b.status === 'APPROVED') && (
                          <button
                            onClick={() => openConvertModal(b)}
                            disabled={!activeCashSession}
                            title={activeCashSession ? 'Convertir a Venta (elegir medio de pago)' : 'Abra la caja para poder convertir'}
                            className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600 text-accent hover:text-white text-xs font-semibold rounded-lg transition flex items-center space-x-1 disabled:opacity-40 disabled:pointer-events-none"
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

      {/* CONVERT TO SALE (CHECKOUT) MODAL */}
      {convertingBudget && (
        <Modal isOpen={isConvertModalOpen} onClose={() => setIsConvertModalOpen(false)} title={`💳 Cobrar Presupuesto ${convertingBudget.budgetNumber}`} maxWidth="lg">
          <div className="space-y-5">
            <div className="p-4 bg-app border border-surface2 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-secondary">Cliente:</div>
                <div className="text-sm font-bold text-heading">{convertingBudget.customerName}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-secondary">Total a Cobrar:</div>
                <div className="text-2xl font-bold font-mono text-teal-400">${convertTotal.toFixed(2)}</div>
              </div>
            </div>

            {/* Tipo de venta: recalcula el precio de cada ítem contra el catálogo actual */}
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Tipo de Venta</label>
              <div className="flex bg-surface2 p-1 rounded-lg w-fit">
                <button type="button" onClick={() => setConvertSaleType('RETAIL')} className={`px-3 py-1.5 rounded text-xs font-semibold transition ${convertSaleType === 'RETAIL' ? 'bg-teal-600 text-white' : 'text-secondary hover:text-heading'}`}>
                  Mostrador
                </button>
                <button type="button" onClick={() => setConvertSaleType('WHOLESALE')} className={`px-3 py-1.5 rounded text-xs font-semibold transition ${convertSaleType === 'WHOLESALE' ? 'bg-teal-600 text-white' : 'text-secondary hover:text-heading'}`}>
                  Mayorista
                </button>
              </div>
            </div>

            {/* Ítems con precio vigente (puede diferir del cotizado en el presupuesto) */}
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {convertItems.map((it: any) => (
                <div key={it.id} className="flex items-center justify-between text-xs bg-surface2/40 rounded-lg px-3 py-2">
                  <span className="text-body">{it.productName} <span className="text-secondary font-mono">x{it.quantity}</span></span>
                  <div className="text-right">
                    <span className="font-mono font-bold text-heading">${it.currentSubtotal.toFixed(2)}</span>
                    {it.priceChanged && (
                      <div className="text-[10px] text-amber-400">precio cotizado: ${(it.unitPrice * it.quantity).toFixed(2)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Descuento general: por monto fijo o por porcentaje del subtotal */}
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Descuento General</label>
              <div className="flex items-center gap-2">
                <div className="flex bg-surface2 p-1 rounded-lg shrink-0">
                  <button type="button" onClick={() => setConvertDiscountType('AMOUNT')} className={`px-2.5 py-1.5 rounded text-xs font-semibold transition ${convertDiscountType === 'AMOUNT' ? 'bg-teal-600 text-white' : 'text-secondary hover:text-heading'}`}>$</button>
                  <button type="button" onClick={() => setConvertDiscountType('PERCENTAGE')} className={`px-2.5 py-1.5 rounded text-xs font-semibold transition ${convertDiscountType === 'PERCENTAGE' ? 'bg-teal-600 text-white' : 'text-secondary hover:text-heading'}`}>%</button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={convertDiscountType === 'PERCENTAGE' ? 100 : undefined}
                  value={convertDiscountValue || ''}
                  onChange={(e) => setConvertDiscountValue(parseFloat(e.target.value || '0'))}
                  placeholder={convertDiscountType === 'PERCENTAGE' ? '0-100' : '0.00'}
                  className="flex-1 bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            </div>

            {/* Medios de Pago Combinados / Pagos Parciales */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-body">Medios de Pago</label>
                <button type="button" onClick={handleAddConvertPayment} className="text-xs text-teal-400 hover:underline flex items-center space-x-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Medio de Pago</span>
                </button>
              </div>

              {convertPayments.map((p, idx) => (
                <div key={idx} className="bg-surface2/60 p-2.5 rounded-lg border border-surface3 space-y-2">
                  <div className="flex items-center space-x-2">
                    <select
                      value={p.paymentMethod}
                      onChange={(e) => handleUpdateConvertPayment(idx, 'paymentMethod', e.target.value)}
                      className="bg-surface border border-surface3 rounded-lg px-3 py-1.5 text-xs text-heading focus:outline-none"
                    >
                      <option value="CASH">Efectivo</option>
                      <option value="DEBIT">Tarjeta Débito</option>
                      <option value="CREDIT">Tarjeta Crédito</option>
                      <option value="TRANSFER">Transferencia</option>
                      <option value="MERCADO_PAGO">Mercado Pago</option>
                      <option value="CURRENT_ACCOUNT">Cuenta Corriente</option>
                    </select>

                    <input
                      type="number"
                      step="0.01"
                      value={p.amount || ''}
                      onChange={(e) => handleUpdateConvertPayment(idx, 'amount', parseFloat(e.target.value || '0'))}
                      placeholder="Monto"
                      className="flex-1 bg-surface border border-surface3 rounded-lg px-3 py-1.5 text-xs text-heading font-mono focus:outline-none"
                    />

                    {convertPayments.length > 1 && (
                      <button type="button" onClick={() => handleRemoveConvertPayment(idx)} className="p-1 text-muted hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {(p.paymentMethod === 'DEBIT' || p.paymentMethod === 'CREDIT') && (
                    <div className="flex items-center gap-2 pl-1">
                      <select
                        value={p.cardType || ''}
                        onChange={(e) => handleUpdateConvertPayment(idx, 'cardType', e.target.value || undefined)}
                        className="flex-1 bg-surface border border-surface3 rounded-lg px-2.5 py-1.5 text-[11px] text-heading focus:outline-none"
                      >
                        <option value="">Marca de tarjeta...</option>
                        {CARD_TYPES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>

                      {p.paymentMethod === 'CREDIT' && (
                        <select
                          value={p.installments || 1}
                          onChange={(e) => handleUpdateConvertPayment(idx, 'installments', parseInt(e.target.value))}
                          className="w-28 bg-surface border border-surface3 rounded-lg px-2.5 py-1.5 text-[11px] text-heading focus:outline-none shrink-0"
                        >
                          {[1, 3, 6, 9, 12, 18, 24].map((n) => (
                            <option key={n} value={n}>{n === 1 ? '1 pago' : `${n} cuotas`}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {convertPayments.some((p) => p.paymentMethod === 'CURRENT_ACCOUNT') && !convertingBudget.customerId && (
                <div className="p-2.5 bg-amber-950/60 border border-amber-800 text-amber-300 text-xs rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Este presupuesto no tiene un cliente asignado: no se puede cobrar a Cuenta Corriente.</span>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-surface2">
              <button type="button" onClick={() => setIsConvertModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 hover:bg-surface3 text-body text-sm font-medium transition">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => convertBudgetMutation.mutate()}
                disabled={convertBudgetMutation.isPending}
                className="px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-lg shadow-teal-500/20 transition disabled:opacity-50 flex items-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {convertBudgetMutation.isPending ? 'Procesando Venta...' : 'Confirmar Cobro y Convertir'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* CONVERSION SUCCESS MODAL */}
      {convertedResult && (
        <Modal isOpen={Boolean(convertedResult)} onClose={() => setConvertedResult(null)} title="🎉 Presupuesto Convertido en Venta" maxWidth="md">
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold text-heading">Venta {convertedResult.sale.saleNumber}</div>
              <div className="text-2xl font-bold font-mono text-teal-400 mt-1">${convertedResult.sale.total.toFixed(2)}</div>
            </div>
            <div className="pt-4 flex flex-col space-y-2">
              <button
                onClick={() => openTicketPreview(convertedResult.sale.id)}
                className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-teal-500/20"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket (Vista Navegador)</span>
              </button>
              <button
                type="button"
                onClick={() => setConvertedResult(null)}
                className="w-full py-2.5 bg-surface2 hover:bg-surface3 text-body text-sm font-semibold rounded-xl transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
