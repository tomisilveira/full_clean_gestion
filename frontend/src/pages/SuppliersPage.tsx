import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { toastSuccess } from '../store/useToastStore';
import { useAuthStore } from '../store/useAuthStore';
import { Truck, Plus, PackagePlus, DollarSign, History, Ban, Eye, X } from 'lucide-react';

export const SuppliersPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchases'>('suppliers');
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPurchaseDetailOpen, setIsPurchaseDetailOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

  // Supplier Form
  const [name, setName] = useState('');
  const [cuit, setCuit] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Purchase Form
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);
  const [payFromCash, setPayFromCash] = useState(false);

  // Payment Form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get('/suppliers')).data,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data,
  });

  const { data: purchases = [], isLoading: isLoadingPurchases } = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => (await api.get('/purchases')).data,
    enabled: activeTab === 'purchases',
  });

  const saveSupplierMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, cuit, contact, phone, email };
      if (selectedSupplier) {
        return (await api.put(`/suppliers/${selectedSupplier.id}`, payload)).data;
      } else {
        return (await api.post('/suppliers', payload)).data;
      }
    },
    onSuccess: () => {
      setIsSupplierModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toastSuccess(selectedSupplier ? 'Proveedor actualizado correctamente.' : 'Proveedor creado correctamente.');
    },
  });

  const savePurchaseMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`/suppliers/${selectedSupplier.id}/purchases`, {
          invoiceNumber,
          items: purchaseItems,
          payFromCash,
        })
      ).data;
    },
    onSuccess: () => {
      setIsPurchaseModalOpen(false);
      setPurchaseItems([]);
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      toastSuccess('Compra cargada e ingresada a stock correctamente.');
    },
  });

  const savePaymentMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`/suppliers/${selectedSupplier.id}/payments`, {
          amount: parseFloat(paymentAmount),
          notes: paymentNotes,
          payFromCash,
        })
      ).data;
    },
    onSuccess: () => {
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
      toastSuccess('Pago registrado correctamente.');
    },
  });

  const cancelPurchaseMutation = useMutation({
    mutationFn: async (purchaseId: number) => {
      return (await api.post(`/purchases/${purchaseId}/cancel`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toastSuccess('Compra anulada y stock revertido correctamente.');
    },
  });

  const handleAddPurchaseItem = (productId: number) => {
    const prod = products.find((p: any) => p.id === productId);
    if (!prod) return;

    setPurchaseItems([
      ...purchaseItems,
      {
        productId: prod.id,
        name: prod.name,
        quantity: 10,
        costPrice: prod.costPrice || 100,
      },
    ]);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <Truck className="w-7 h-7 text-teal-400" />
            Proveedores y Registro de Compras
          </h1>
          <p className="text-xs text-secondary mt-1">
            Recepción de mercadería, ingreso automático al stock y saldos a pagar a proveedores.
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedSupplier(null);
            setName('');
            setCuit('');
            setContact('');
            setPhone('');
            setEmail('');
            setIsSupplierModalOpen(true);
          }}
          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Proveedor</span>
        </button>
      </div>

      {/* Tabs: Proveedores / Historial de Compras */}
      <div className="flex bg-surface2 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'suppliers' ? 'bg-teal-600 text-white shadow-md' : 'text-secondary hover:text-heading'
          }`}
        >
          Proveedores
        </button>
        <button
          onClick={() => setActiveTab('purchases')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'purchases' ? 'bg-teal-600 text-white shadow-md' : 'text-secondary hover:text-heading'
          }`}
        >
          Historial de Compras
        </button>
      </div>

      {activeTab === 'suppliers' ? (
      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">Proveedor</th>
                <th className="p-4">CUIT</th>
                <th className="p-4">Contacto</th>
                <th className="p-4 text-right">Saldo Deuda</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    Cargando proveedores...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted">
                    No hay proveedores registrados.
                  </td>
                </tr>
              ) : (
                suppliers.map((s: any) => (
                  <tr key={s.id} className="hover:bg-surface2/40 transition">
                    <td className="p-4 font-semibold text-heading">{s.name}</td>
                    <td className="p-4 font-mono text-xs text-secondary">{s.cuit || '-'}</td>
                    <td className="p-4 text-secondary">{s.contact || s.phone || '-'}</td>
                    <td className="p-4 text-right font-mono font-bold text-red-400">${s.balance.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedSupplier(s);
                            setPurchaseItems([]);
                            setInvoiceNumber('');
                            setIsPurchaseModalOpen(true);
                          }}
                          title="Cargar Compra de Mercadería"
                          className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600 text-accent hover:text-white text-xs font-semibold rounded-lg transition flex items-center space-x-1"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          <span>Cargar Compra</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedSupplier(s);
                            setIsPaymentModalOpen(true);
                          }}
                          title="Pagar a Proveedor"
                          className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-amber-400 transition"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">Fecha</th>
                <th className="p-4">Proveedor</th>
                <th className="p-4">Fact./Remito</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {isLoadingPurchases ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    Cargando historial de compras...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    No se registraron compras aún.
                  </td>
                </tr>
              ) : (
                purchases.map((p: any) => (
                  <tr key={p.id} className="hover:bg-surface2/40 transition">
                    <td className="p-4 text-xs text-secondary">{new Date(p.createdAt).toLocaleString('es-AR')}</td>
                    <td className="p-4 font-medium text-heading">{p.supplier?.name}</td>
                    <td className="p-4 font-mono text-xs text-secondary">{p.invoiceNumber || '-'}</td>
                    <td className="p-4 text-right font-mono font-bold text-heading">${p.total.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          p.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-red-950 text-red-300 border border-red-800'
                        }`}
                      >
                        {p.status === 'COMPLETED' ? 'REGISTRADA' : 'ANULADA'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedPurchase(p);
                            setIsPurchaseDetailOpen(true);
                          }}
                          title="Ver Detalle"
                          className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-body transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {isAdmin && p.status === 'COMPLETED' && (
                          <button
                            onClick={() => {
                              if (confirm(`¿Confirma anular la compra a ${p.supplier?.name} por $${p.total.toFixed(2)}? Se descontará el stock ingresado y se revertirá la deuda al proveedor.`)) {
                                cancelPurchaseMutation.mutate(p.id);
                              }
                            }}
                            title="Anular Compra"
                            className="p-1.5 rounded-lg bg-surface2 hover:bg-rose-900/60 text-secondary hover:text-rose-400 transition"
                          >
                            <Ban className="w-4 h-4" />
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
      )}

      {/* CREATE SUPPLIER MODAL */}
      <Modal isOpen={isSupplierModalOpen} onClose={() => setIsSupplierModalOpen(false)} title="Nuevo Proveedor">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSupplierMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Razón Social *</label>
            <input
              type="text"
              required
              placeholder="Ej: Química Argentina S.A."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">CUIT</label>
              <input
                type="text"
                placeholder="30-70000000-8"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Contacto / Vendedor</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
            <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saveSupplierMutation.isPending} className="px-5 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm">
              Guardar Proveedor
            </button>
          </div>
        </form>
      </Modal>

      {/* REGISTER PURCHASE MODAL */}
      {selectedSupplier && (
        <Modal isOpen={isPurchaseModalOpen} onClose={() => setIsPurchaseModalOpen(false)} title={`Cargar Compra: ${selectedSupplier.name}`} maxWidth="lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePurchaseMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Nº Factura / Remito de Compra</label>
              <input
                type="text"
                placeholder="FC A 0001-00001234"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Agregar Producto a la Compra</label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddPurchaseItem(parseInt(e.target.value));
                    e.target.value = '';
                  }
                }}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="">-- Seleccionar producto para ingresar stock --</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Stock actual: {p.currentStock})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Purchase Items list */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {purchaseItems.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-3 bg-surface2/60 p-2.5 rounded-lg border border-surface3 text-xs">
                  <div className="flex-1 font-bold text-heading">{item.name}</div>

                  <div className="w-24">
                    <span className="text-[10px] text-secondary block">Cant.</span>
                    <input
                      type="number"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const updated = [...purchaseItems];
                        updated[idx].quantity = parseFloat(e.target.value || '0');
                        setPurchaseItems(updated);
                      }}
                      className="w-full bg-surface border border-surface3 rounded px-2 py-1 font-mono text-heading"
                    />
                  </div>

                  <div className="w-28">
                    <span className="text-[10px] text-secondary block">Costo ($)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.costPrice}
                      onChange={(e) => {
                        const updated = [...purchaseItems];
                        updated[idx].costPrice = parseFloat(e.target.value || '0');
                        setPurchaseItems(updated);
                      }}
                      className="w-full bg-surface border border-surface3 rounded px-2 py-1 font-mono text-heading"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
              <button type="button" onClick={() => setIsPurchaseModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={savePurchaseMutation.isPending || purchaseItems.length === 0} className="px-5 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm">
                Confirmar e Ingresar a Stock
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* SUPPLIER PAYMENT MODAL */}
      {selectedSupplier && (
        <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={`Pago a Proveedor: ${selectedSupplier.name}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePaymentMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Monto Pagado ($) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-base text-heading font-mono font-bold focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={savePaymentMutation.isPending} className="px-5 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm">
                Confirmar Pago
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* PURCHASE DETAIL MODAL */}
      {selectedPurchase && (
        <Modal isOpen={isPurchaseDetailOpen} onClose={() => setIsPurchaseDetailOpen(false)} title={`Detalle de Compra #${selectedPurchase.id}`} maxWidth="md">
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-app rounded-xl space-y-1.5">
              <div className="flex justify-between">
                <span className="text-secondary">Proveedor:</span>
                <span className="text-heading font-bold">{selectedPurchase.supplier?.name}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Fact./Remito:</span>
                <span className="text-heading">{selectedPurchase.invoiceNumber || '-'}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Fecha:</span>
                <span className="text-heading">{new Date(selectedPurchase.createdAt).toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-secondary">Estado:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  selectedPurchase.status === 'COMPLETED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-red-950 text-red-300 border border-red-800'
                }`}>
                  {selectedPurchase.status === 'COMPLETED' ? 'REGISTRADA' : 'ANULADA'}
                </span>
              </div>
            </div>

            <div>
              <div className="font-semibold text-body mb-2">Ítems Ingresados:</div>
              <div className="space-y-1.5">
                {selectedPurchase.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center bg-surface2/60 p-2 rounded-lg border border-surface3">
                    <div>
                      <div className="font-bold text-heading">{item.product?.name || `Producto #${item.productId}`}</div>
                      <div className="text-[11px] text-secondary">{item.quantity} x ${item.costPrice.toFixed(2)}</div>
                    </div>
                    <div className="font-mono font-bold text-heading">${item.subtotal.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between text-sm font-bold text-heading pt-2 border-t border-surface2">
              <span>TOTAL:</span>
              <span className="font-mono text-teal-400">${selectedPurchase.total.toFixed(2)}</span>
            </div>

            <div className="flex gap-2 pt-2 border-t border-surface2">
              {isAdmin && selectedPurchase.status === 'COMPLETED' && (
                <button
                  onClick={() => {
                    if (confirm(`¿Confirma anular esta compra? Se descontará el stock ingresado y se revertirá la deuda al proveedor.`)) {
                      cancelPurchaseMutation.mutate(selectedPurchase.id);
                      setIsPurchaseDetailOpen(false);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800 text-rose-300 font-semibold rounded-lg transition"
                >
                  <Ban className="w-4 h-4" /> Anular Compra
                </button>
              )}
              <button
                onClick={() => setIsPurchaseDetailOpen(false)}
                className="px-4 py-2 bg-surface2 hover:bg-surface3 text-body font-semibold rounded-lg transition flex items-center gap-2"
              >
                <X className="w-4 h-4" /> Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
