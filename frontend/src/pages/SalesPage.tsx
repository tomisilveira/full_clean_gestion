import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { useAuthStore } from '../store/useAuthStore';
import { openTicketPreview } from '../utils/tickets';
import { Receipt, Printer, FileText, Ban, Eye, CheckCircle2, Calendar, AlertTriangle, Building2, User, X } from 'lucide-react';

const todayStr = () => new Date().toISOString().slice(0, 10);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  DEBIT: 'Tarjeta Débito',
  CREDIT: 'Tarjeta Crédito',
  TRANSFER: 'Transferencia',
  MERCADO_PAGO: 'Mercado Pago',
  CURRENT_ACCOUNT: 'Cuenta Corriente',
};

const CBTE_TIPO_LABELS: Record<number, string> = {
  1: 'Factura A', 6: 'Factura B', 11: 'Factura C',
  3: 'Nota de Crédito A', 8: 'Nota de Crédito B', 13: 'Nota de Crédito C',
};

// Regla de negocio: requiere factura ARCA obligatoria toda venta a un cliente identificado
// (tiene CUIT/DNI cargado, ej. cuenta corriente o mayorista). Un Consumidor Final anónimo
// de mostrador no la requiere: alcanza con el ticket interno, aunque se puede facturar igual si se quiere.
function requiresInvoice(sale: any): boolean {
  return !!sale.customer?.cuitDni;
}

export const SalesPage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [showAllSucursales, setShowAllSucursales] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());

  const queryClient = useQueryClient();

  const { data: allSales = [], isLoading } = useQuery({
    queryKey: ['sales', showAllSucursales, startDate, endDate],
    queryFn: async () =>
      (
        await api.get('/sales', {
          params: {
            startDate,
            endDate,
            ...(isAdmin && showAllSucursales ? { all: 'true' } : {}),
          },
        })
      ).data,
  });

  const pendingCount = allSales.filter((s: any) => s.status === 'COMPLETED' && requiresInvoice(s) && !s.invoiceARCA).length;
  const sales = onlyPending
    ? allSales.filter((s: any) => requiresInvoice(s) && !s.invoiceARCA)
    : allSales;

  const emitInvoiceMutation = useMutation({
    mutationFn: async (saleId: number) => {
      return (await api.post(`/arca/invoice/${saleId}`)).data;
    },
    onSuccess: (invoice, saleId) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setSelectedSale((prev: any) => (prev && prev.id === saleId ? { ...prev, invoiceARCA: invoice } : prev));
    },
  });

  const cancelSaleMutation = useMutation({
    mutationFn: async (saleId: number) => {
      return (await api.post(`/sales/${saleId}/cancel`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
          <Receipt className="w-7 h-7 text-teal-400" />
          Ventas y Facturación Electrónica ARCA (AFIP)
        </h1>
        <p className="text-xs text-secondary mt-1">
          Historial de operaciones, comprobantes electrónicos A/B/C, obtención de CAE y reimpresión de tickets térmicos.
        </p>
      </div>

      {pendingCount > 0 && (
        <button
          onClick={() => setOnlyPending(!onlyPending)}
          className={`w-full text-left p-4 rounded-2xl flex items-center justify-between transition ${
            onlyPending
              ? 'bg-amber-900/40 border border-amber-700'
              : 'bg-amber-950/40 border border-amber-800/80 hover:border-amber-700'
          }`}
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-300">
              Hay <strong>{pendingCount}</strong> venta(s) a cliente con CUIT/DNI que todavía no tiene(n) factura ARCA emitida.
            </span>
          </div>
          <span className="text-xs font-semibold text-amber-400 underline shrink-0 ml-3">
            {onlyPending ? 'Ver todas' : 'Ver solo pendientes'}
          </span>
        </button>
      )}

      {/* Filtro de período */}
      <div className="bg-surface border border-surface2 rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-secondary">
          <Calendar className="w-4 h-4 text-teal-400" />
          <span className="font-semibold">Período:</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-secondary">Desde:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-surface2 border border-surface3 rounded-lg px-3 py-1.5 text-sm text-heading focus:outline-none focus:border-teal-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-secondary">Hasta:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-surface2 border border-surface3 rounded-lg px-3 py-1.5 text-sm text-heading focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setStartDate(todayStr()); setEndDate(todayStr()); }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface2 hover:bg-surface3 text-body transition border border-surface3"
          >
            Hoy
          </button>
          <button
            onClick={() => {
              const start = new Date();
              start.setDate(start.getDate() - 7);
              setStartDate(start.toISOString().slice(0, 10));
              setEndDate(todayStr());
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface2 hover:bg-surface3 text-body transition border border-surface3"
          >
            Últ. 7 días
          </button>
          <button
            onClick={() => {
              const start = new Date();
              start.setDate(1);
              setStartDate(start.toISOString().slice(0, 10));
              setEndDate(todayStr());
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface2 hover:bg-surface3 text-body transition border border-surface3"
          >
            Este mes
          </button>
          <button
            onClick={() => { setStartDate('2020-01-01'); setEndDate(todayStr()); }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface2 hover:bg-surface3 text-body transition border border-surface3"
          >
            Todas
          </button>
        </div>

        {isAdmin && (
          <label className="flex items-center gap-2 text-xs text-secondary font-semibold cursor-pointer ml-auto">
            <input type="checkbox" checked={showAllSucursales} onChange={(e) => setShowAllSucursales(e.target.checked)} className="accent-teal-500" />
            Ver todas las sucursales
          </label>
        )}
      </div>

      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">Nº Venta</th>
                {showAllSucursales && <th className="p-4">Sucursal</th>}
                <th className="p-4">Fecha / Hora</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Vendedor</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-center">Factura ARCA</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {isLoading ? (
                <tr>
                  <td colSpan={showAllSucursales ? 9 : 8} className="p-8 text-center text-muted">
                    Cargando historial de ventas...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={showAllSucursales ? 9 : 8} className="p-8 text-center text-muted">
                    No se registraron ventas aún.
                  </td>
                </tr>
              ) : (
                sales.map((s: any) => (
                  <tr key={s.id} className="hover:bg-surface2/40 transition">
                    <td className="p-4 font-mono text-xs font-bold text-teal-400">{s.saleNumber}</td>
                    {showAllSucursales && <td className="p-4 text-xs text-secondary">{s.sucursal?.nombre}</td>}
                    <td className="p-4 text-xs text-secondary">{new Date(s.createdAt).toLocaleString('es-AR')}</td>
                    <td className="p-4 font-medium text-heading">{s.customer?.name || 'Consumidor Final'}</td>
                    <td className="p-4 text-xs text-secondary">{s.user?.name}</td>
                    <td className="p-4 text-right font-mono font-bold text-heading">${s.total.toFixed(2)}</td>
                    <td className="p-4 text-center">
                      {s.invoiceARCA ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-blue-950 text-blue-300 border border-blue-800">
                          <CheckCircle2 className="w-3 h-3 text-blue-400" />
                          <span>
                            {s.invoiceARCA.cbteTipo === 1 ? 'Fact. A' : s.invoiceARCA.cbteTipo === 6 ? 'Fact. B' : 'Fact. C'} #
                            {s.invoiceARCA.cbteDesde.toString()}
                          </span>
                        </span>
                      ) : requiresInvoice(s) ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 border border-amber-800 text-amber-300">
                            <AlertTriangle className="w-3 h-3" />
                            Pendiente (cliente c/CUIT)
                          </span>
                          <button
                            onClick={() => emitInvoiceMutation.mutate(s.id)}
                            disabled={emitInvoiceMutation.isPending || s.status === 'CANCELLED'}
                            className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600 text-accent hover:text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
                          >
                            Emitir Factura ARCA
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface2 text-secondary border border-surface3">
                            No requiere (Ticket)
                          </span>
                          <button
                            onClick={() => emitInvoiceMutation.mutate(s.id)}
                            disabled={emitInvoiceMutation.isPending || s.status === 'CANCELLED'}
                            className="text-[11px] text-secondary hover:text-teal-400 underline transition"
                          >
                            Facturar igual
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          s.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-red-950 text-red-300 border border-red-800'
                        }`}
                      >
                        {s.status === 'COMPLETED' ? 'COMPLETADA' : 'ANULADA'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => openTicketPreview(s.id)}
                          title="Reimprimir Ticket"
                          className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-body transition"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedSale(s);
                            setIsDetailModalOpen(true);
                          }}
                          title="Ver Detalle"
                          className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-body transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {s.status === 'COMPLETED' && (
                          <button
                            onClick={() => {
                              if (confirm(`¿Confirma anular la venta ${s.saleNumber}? Se restituirá el stock al inventario.`)) {
                                cancelSaleMutation.mutate(s.id);
                              }
                            }}
                            title="Anular Venta"
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

      {/* SALE DETAIL MODAL */}
      {selectedSale && (
        <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={`Detalle de Venta ${selectedSale.saleNumber}`} maxWidth="md">
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="p-3 bg-app rounded-xl space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-secondary"><User className="w-3.5 h-3.5" /> Cliente:</span>
                <span className="text-heading font-bold text-right">
                  {selectedSale.customer?.name || 'Consumidor Final'}
                  {selectedSale.customer?.cuitDni && <span className="text-secondary font-normal"> ({selectedSale.customer.cuitDni})</span>}
                </span>
              </div>
              {selectedSale.sucursal && (
                <div className="flex justify-between text-secondary">
                  <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Sucursal:</span>
                  <span className="text-heading">{selectedSale.sucursal.nombre}</span>
                </div>
              )}
              <div className="flex justify-between text-secondary">
                <span>Vendedor:</span>
                <span className="text-heading">{selectedSale.user?.name}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Fecha:</span>
                <span className="text-heading">{new Date(selectedSale.createdAt).toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between text-secondary">
                <span>Tipo de Venta:</span>
                <span className="text-heading">{selectedSale.saleType === 'WHOLESALE' ? 'Mayorista' : 'Mostrador'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-secondary">Estado:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  selectedSale.status === 'COMPLETED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : 'bg-red-950 text-red-300 border border-red-800'
                }`}>
                  {selectedSale.status === 'COMPLETED' ? 'COMPLETADA' : 'ANULADA'}
                </span>
              </div>
            </div>

            {/* Items list */}
            <div>
              <div className="font-semibold text-body mb-2">Ítems Vendidos:</div>
              <div className="space-y-1.5">
                {selectedSale.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center bg-surface2/60 p-2 rounded-lg border border-surface3">
                    <div>
                      <div className="font-bold text-heading">{item.productName}</div>
                      <div className="text-[11px] text-secondary">
                        {item.quantity} x ${item.unitPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-heading">${item.subtotal.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1 pt-2 border-t border-surface2">
              <div className="flex justify-between text-secondary">
                <span>Subtotal:</span>
                <span className="font-mono text-heading">${selectedSale.subtotal.toFixed(2)}</span>
              </div>
              {selectedSale.discount > 0 && (
                <div className="flex justify-between text-teal-400">
                  <span>Descuento:</span>
                  <span className="font-mono">-${selectedSale.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-heading">
                <span>TOTAL:</span>
                <span className="font-mono text-teal-400">${selectedSale.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payments breakdown */}
            <div>
              <div className="font-semibold text-body mb-2">Forma(s) de Pago:</div>
              <div className="space-y-1">
                {selectedSale.payments.map((p: any) => (
                  <div key={p.id} className="flex justify-between bg-surface2/60 px-3 py-1.5 rounded-lg border border-surface3">
                    <span className="text-secondary">{PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod}</span>
                    <span className="font-mono font-bold text-heading">${p.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Estado de facturación ARCA */}
            {selectedSale.invoiceARCA ? (
              <div className="p-3 bg-blue-950/60 border border-blue-800 rounded-xl space-y-1 text-blue-300 font-mono">
                <div className="font-bold text-sm font-sans">
                  {CBTE_TIPO_LABELS[selectedSale.invoiceARCA.cbteTipo] || 'Comprobante Electrónico ARCA'}
                  {' '}#{selectedSale.invoiceARCA.ptoVta.toString().padStart(4, '0')}-{selectedSale.invoiceARCA.cbteDesde.toString().padStart(8, '0')}
                </div>
                <div>CAE: {selectedSale.invoiceARCA.cae}</div>
                <div>Vencimiento CAE: {selectedSale.invoiceARCA.caeVto}</div>
              </div>
            ) : requiresInvoice(selectedSale) ? (
              <div className="p-3 bg-amber-950/60 border border-amber-800 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-amber-300 font-sans">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Pendiente de facturar (cliente con CUIT/DNI).</span>
                </div>
                <button
                  onClick={() => emitInvoiceMutation.mutate(selectedSale.id)}
                  disabled={emitInvoiceMutation.isPending || selectedSale.status === 'CANCELLED'}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 shrink-0 font-sans"
                >
                  {emitInvoiceMutation.isPending ? 'Emitiendo...' : 'Emitir Factura'}
                </button>
              </div>
            ) : (
              <div className="p-3 bg-surface2/60 border border-surface3 rounded-xl flex items-center justify-between gap-3 font-sans">
                <span className="text-secondary">No requiere factura ARCA (Consumidor Final, alcanza con el ticket).</span>
                <button
                  onClick={() => emitInvoiceMutation.mutate(selectedSale.id)}
                  disabled={emitInvoiceMutation.isPending || selectedSale.status === 'CANCELLED'}
                  className="text-teal-400 hover:underline text-xs font-semibold shrink-0 disabled:opacity-50"
                >
                  Facturar igual
                </button>
              </div>
            )}

            {/* Acciones rápidas */}
            <div className="flex gap-2 pt-2 border-t border-surface2">
              <button
                onClick={() => openTicketPreview(selectedSale.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-surface2 hover:bg-surface3 text-body font-semibold rounded-lg transition"
              >
                <Printer className="w-4 h-4" /> Reimprimir Ticket
              </button>
              <button
                onClick={() => setIsDetailModalOpen(false)}
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
