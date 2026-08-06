import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { Truck, Plus, PackagePlus, DollarSign, History } from 'lucide-react';

export const SuppliersPage: React.FC = () => {
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
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
    </div>
  );
};
