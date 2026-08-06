import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { usePosStore } from '../store/usePosStore';
import { QuickBarcodeModal } from '../components/QuickBarcodeModal';
import { Modal } from '../components/Modal';
import { openTicketPreview } from '../utils/tickets';
import {
  Barcode,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  CreditCard,
  Printer,
  AlertTriangle,
  User,
  Tag,
} from 'lucide-react';

export const PosPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [quickBarcode, setQuickBarcode] = useState('');
  const [isQuickModalOpen, setIsQuickModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [createdSale, setCreatedSale] = useState<any>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const {
    cart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    selectedCustomerId,
    selectedCustomerName,
    setCustomer,
    saleType,
    setSaleType,
    discount,
    setDiscount,
    payments,
    setPayments,
    getSubtotal,
    getTotal,
  } = usePosStore();

  // Focus search input on mount and on keypress
  useEffect(() => {
    searchInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch Products & Categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get('/categories')).data,
  });

  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products', searchInput, selectedCategory],
    queryFn: async () => {
      const res = await api.get('/products', {
        params: { search: searchInput, categoryId: selectedCategory || undefined },
      });
      return res.data;
    },
  });

  // Fetch Customers
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });

  // Fetch Current Open Cash Session
  const { data: cashData } = useQuery({
    queryKey: ['currentCash'],
    queryFn: async () => (await api.get('/cash/current')).data,
  });

  const activeCashSession = cashData?.activeSession;

  // Handle Search Input submit (Barcode Scanner Enter listener)
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;

    // Check if exact code matches in loaded products
    const exactMatch = products.find(
      (p: any) => p.code.toLowerCase() === query.toLowerCase()
    );

    if (exactMatch) {
      addItem(exactMatch, 1);
      setSearchInput('');
      return;
    }

    // Try direct backend lookup by code
    try {
      const res = await api.get(`/products/code/${encodeURIComponent(query)}`);
      if (res.data) {
        addItem(res.data, 1);
        setSearchInput('');
      }
    } catch (err: any) {
      // Barcode not found -> Open Quick Barcode Registration Modal!
      if (err.response && err.response.status === 404) {
        setQuickBarcode(query);
        setIsQuickModalOpen(true);
      }
    }
  };

  // Submit Sale Mutation
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const total = getTotal();

      // Format payment list
      const formattedPayments = payments.map((p) => ({
        paymentMethod: p.paymentMethod,
        amount: p.amount,
      }));

      const res = await api.post('/sales', {
        customerId: selectedCustomerId,
        saleType,
        items: cart,
        payments: formattedPayments,
        discount,
      });

      return res.data;
    },
    onSuccess: (data) => {
      setCreatedSale(data);
      setIsCheckoutModalOpen(false);
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const totalAmount = getTotal();

  // Split payment handler
  const handleAddPayment = () => {
    setPayments([...payments, { paymentMethod: 'CASH', amount: 0 }]);
  };

  const handleUpdatePayment = (index: number, field: string, value: any) => {
    const updated = [...payments];
    updated[index] = { ...updated[index], [field]: value };
    setPayments(updated);
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  // Auto distribute remaining amount on checkout modal open
  const openCheckoutModal = () => {
    setPayments([{ paymentMethod: 'CASH', amount: totalAmount }]);
    setIsCheckoutModalOpen(true);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* LEFT SECTION: Search & Product Catalog Grid */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden border-r border-surface2">
        {/* Search Bar (Optimizada para Lector HID de Código de Barras) */}
        <form onSubmit={handleSearchSubmit} className="mb-4 flex space-x-3">
          <div className="relative flex-1">
            <Barcode className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Escanee código de barras o busque por nombre (F2)..."
              className="w-full bg-surface border-2 border-surface3 focus:border-teal-500 rounded-xl pl-10 pr-4 py-3 text-base text-heading placeholder-muted focus:outline-none focus:ring-2 focus:ring-teal-500/20 font-mono shadow-inner"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl transition flex items-center space-x-2 shadow-lg shadow-teal-500/20"
          >
            <Search className="w-5 h-5" />
            <span>Buscar</span>
          </button>
        </form>

        {/* Categories Bar */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-3 scrollbar-none">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              selectedCategory === null
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-surface2 text-secondary hover:bg-surface3 hover:text-heading'
            }`}
          >
            Todos
          </button>
          {categories.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-teal-600 text-white shadow-md'
                  : 'bg-surface2 text-secondary hover:bg-surface3 hover:text-heading'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products List */}
        <div className="flex-1 overflow-y-auto pr-1 rounded-xl border border-surface2 bg-surface/40">
          {isLoadingProducts ? (
            <div className="flex items-center justify-center text-muted text-sm py-12">
              Cargando productos...
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted text-sm py-12">
              <Barcode className="w-12 h-12 mb-2 text-faint stroke-[1.5]" />
              <p>No se encontraron productos con ese filtro.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-surface z-10">
                <tr className="text-[11px] uppercase font-semibold text-secondary border-b border-surface2">
                  <th className="text-left py-2.5 px-3">Código</th>
                  <th className="text-left py-2.5 px-3">Producto</th>
                  <th className="text-right py-2.5 px-3">Precio</th>
                  <th className="text-center py-2.5 px-3">Stock</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface2/60">
                {products.map((prod: any) => {
                  const price = saleType === 'WHOLESALE' ? (prod.wholesalePrice || prod.salePrice) : prod.salePrice;
                  const isLowStock = prod.currentStock <= prod.minStock;

                  return (
                    <tr
                      key={prod.id}
                      onClick={() => addItem(prod, 1)}
                      className="cursor-pointer hover:bg-surface2/70 transition group"
                    >
                      <td className="py-2.5 px-3 font-mono text-xs text-muted whitespace-nowrap">{prod.code}</td>
                      <td className="py-2.5 px-3">
                        <div className="text-sm font-semibold text-heading group-hover:text-accent">{prod.name}</div>
                        {prod.category?.name && (
                          <div className="text-[11px] text-secondary">{prod.category.name}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-400 whitespace-nowrap">
                        ${price.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                            isLowStock
                              ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
                              : 'text-secondary'
                          }`}
                        >
                          {prod.currentStock} {prod.unit}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="w-7 h-7 ml-auto rounded-lg bg-teal-600/20 group-hover:bg-teal-600 text-teal-400 group-hover:text-white flex items-center justify-center transition">
                          <Plus className="w-4 h-4" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* RIGHT SECTION: Cart Side Panel */}
      <div className="w-96 bg-surface/90 flex flex-col shrink-0 border-l border-surface2">
        {/* Customer & Sale Type Selection Header */}
        <div className="p-4 border-b border-surface2 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-secondary">Punto de Venta</span>
            {/* Sale Type Toggle */}
            <div className="flex bg-surface2 p-1 rounded-lg">
              <button
                onClick={() => setSaleType('RETAIL')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  saleType === 'RETAIL' ? 'bg-teal-600 text-white' : 'text-secondary hover:text-heading'
                }`}
              >
                Mostrador
              </button>
              <button
                onClick={() => setSaleType('WHOLESALE')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  saleType === 'WHOLESALE' ? 'bg-teal-600 text-white' : 'text-secondary hover:text-heading'
                }`}
              >
                Mayorista
              </button>
            </div>
          </div>

          {/* Customer Select */}
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <select
              value={selectedCustomerId || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : null;
                const cust = customers.find((c: any) => c.id === val);
                setCustomer(val, cust ? cust.name : 'Consumidor Final');
              }}
              className="w-full bg-surface2 border border-surface3 rounded-lg pl-9 pr-3 py-2 text-xs text-heading focus:outline-none focus:border-teal-500"
            >
              <option value="">Cliente: Consumidor Final</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.cuitDni ? `(${c.cuitDni})` : ''} - {c.priceList === 'WHOLESALE' ? 'Mayorista' : 'Minorista'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted text-sm py-12">
              <ShoppingCart className="w-12 h-12 mb-3 stroke-[1.5] text-surface3" />
              <p className="font-medium">Carrito Vacío</p>
              <p className="text-xs text-faint mt-1">Escanee o seleccione un producto para comenzar.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="bg-surface2/60 border border-surface3/60 rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-heading">{item.name}</div>
                    <div className="text-[11px] font-mono text-secondary">${item.unitPrice.toFixed(2)} c/u</div>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-muted hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center space-x-2 bg-surface rounded-lg p-1 border border-surface3">
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="p-1 text-secondary hover:text-white"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold px-2 text-accent">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="p-1 text-secondary hover:text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-sm font-bold font-mono text-heading">
                    ${item.subtotal.toFixed(2)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Summary & Checkout Button */}
        <div className="p-4 border-t border-surface2 bg-app space-y-3">
          <div className="space-y-1.5 text-xs text-secondary">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-mono text-heading">${getSubtotal().toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-teal-400">
                <span>Descuento:</span>
                <span className="font-mono">-${discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-heading pt-1 border-t border-surface2">
              <span>TOTAL:</span>
              <span className="font-mono text-teal-400 text-lg">${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {!activeCashSession && (
            <div className="p-2.5 bg-amber-950/60 border border-amber-800 text-amber-300 text-xs rounded-lg flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Debe abrir la caja antes de registrar ventas.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="py-2.5 px-3 bg-surface2 hover:bg-surface3 text-body text-xs font-semibold rounded-xl transition disabled:opacity-50"
            >
              Vaciar
            </button>

            <button
              onClick={openCheckoutModal}
              disabled={cart.length === 0 || !activeCashSession}
              className="py-2.5 px-3 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              <span>COBRAR</span>
            </button>
          </div>
        </div>
      </div>

      {/* QUICK BARCODE MODAL */}
      <QuickBarcodeModal
        isOpen={isQuickModalOpen}
        onClose={() => setIsQuickModalOpen(false)}
        scannedCode={quickBarcode}
        onSuccess={(newProduct) => {
          queryClient.invalidateQueries({ queryKey: ['products'] });
          addItem(newProduct, 1);
        }}
      />

      {/* CHECKOUT & SPLIT PAYMENT MODAL */}
      <Modal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        title="💳 Procesar Cobro de Venta"
        maxWidth="lg"
      >
        <div className="space-y-5">
          <div className="p-4 bg-app border border-surface2 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-secondary">Cliente Asignado:</div>
              <div className="text-sm font-bold text-heading">{selectedCustomerName}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-secondary">Total a Cobrar:</div>
              <div className="text-2xl font-bold font-mono text-teal-400">${totalAmount.toFixed(2)}</div>
            </div>
          </div>

          {/* Descuento general */}
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Descuento General ($)</label>
            <input
              type="number"
              step="0.01"
              value={discount || ''}
              onChange={(e) => setDiscount(parseFloat(e.target.value || '0'))}
              placeholder="0.00"
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          {/* Medios de Pago Combinados / Pagos Parciales */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-body">Medios de Pago</label>
              <button
                type="button"
                onClick={handleAddPayment}
                className="text-xs text-teal-400 hover:underline flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Medio de Pago</span>
              </button>
            </div>

            {payments.map((p, idx) => (
              <div key={idx} className="flex items-center space-x-2 bg-surface2/60 p-2.5 rounded-lg border border-surface3">
                <select
                  value={p.paymentMethod}
                  onChange={(e) => handleUpdatePayment(idx, 'paymentMethod', e.target.value)}
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
                  onChange={(e) => handleUpdatePayment(idx, 'amount', parseFloat(e.target.value || '0'))}
                  placeholder="Monto"
                  className="flex-1 bg-surface border border-surface3 rounded-lg px-3 py-1.5 text-xs text-heading font-mono focus:outline-none"
                />

                {payments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemovePayment(idx)}
                    className="p-1 text-muted hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-surface2">
            <button
              type="button"
              onClick={() => setIsCheckoutModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-surface2 hover:bg-surface3 text-body text-sm font-medium transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-lg shadow-teal-500/20 transition disabled:opacity-50"
            >
              {checkoutMutation.isPending ? 'Procesando Venta...' : 'Confirmar y Finalizar Venta'}
            </button>
          </div>
        </div>
      </Modal>

      {/* SALE SUCCESS & TICKET PRINT MODAL */}
      {createdSale && (
        <Modal
          isOpen={Boolean(createdSale)}
          onClose={() => setCreatedSale(null)}
          title="🎉 Venta Registrada con Éxito"
          maxWidth="md"
        >
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6" />
            </div>

            <div>
              <div className="text-lg font-bold text-heading">Venta {createdSale.saleNumber}</div>
              <div className="text-2xl font-bold font-mono text-teal-400 mt-1">${createdSale.total.toFixed(2)}</div>
            </div>

            <div className="pt-4 flex flex-col space-y-2">
              <button
                onClick={() => openTicketPreview(createdSale.id)}
                className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-teal-500/20"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket (Vista Navegador)</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedSale(null)}
                className="w-full py-2.5 bg-surface2 hover:bg-surface3 text-body text-sm font-semibold rounded-xl transition"
              >
                Nueva Venta
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
