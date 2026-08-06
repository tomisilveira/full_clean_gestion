import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { useAuthStore } from '../store/useAuthStore';
import {
  Wallet,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Unlock,
  History,
  TrendingUp,
  CreditCard,
  Building,
} from 'lucide-react';

export const CashPage: React.FC = () => {
  const { activeSucursal } = useAuthStore();
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);

  // Form states
  const [initialAmount, setInitialAmount] = useState('0');
  const [actualAmount, setActualAmount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  // Movement Form
  const [movementType, setMovementType] = useState<'MANUAL_IN' | 'EXPENSE' | 'WITHDRAWAL'>('EXPENSE');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNotes, setMovementNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');

  const queryClient = useQueryClient();

  const { data: currentData, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ['currentCash'],
    queryFn: async () => (await api.get('/cash/current')).data,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['cashHistory'],
    queryFn: async () => (await api.get('/cash/history')).data,
  });

  const activeSession = currentData?.activeSession;
  const totals = currentData?.totals;

  const openCashMutation = useMutation({
    mutationFn: async () => {
      return (await api.post('/cash/open', { initialAmount: parseFloat(initialAmount || '0') })).data;
    },
    onSuccess: () => {
      setIsOpenModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] });
    },
  });

  const closeCashMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post('/cash/close', {
          actualAmount: parseFloat(actualAmount || '0'),
          notes: closeNotes,
        })
      ).data;
    },
    onSuccess: () => {
      setIsCloseModalOpen(false);
      setActualAmount('');
      setCloseNotes('');
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] });
    },
  });

  const addMovementMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post('/cash/movement', {
          type: movementType,
          amount: parseFloat(movementAmount || '0'),
          paymentMethod,
          notes: movementNotes,
        })
      ).data;
    },
    onSuccess: () => {
      setIsMovementModalOpen(false);
      setMovementAmount('');
      setMovementNotes('');
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <Wallet className="w-7 h-7 text-teal-400" />
            Caja y Arqueos
          </h1>
          <p className="text-xs text-secondary mt-1">
            Control de aperturas, cierres de turno, movimientos de dinero y desglose por medio de pago.
            {' '}Sucursal: <span className="text-teal-400 font-semibold">{activeSucursal?.nombre}</span>.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {!activeSession ? (
            <button
              onClick={() => setIsOpenModalOpen(true)}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center space-x-2"
            >
              <Unlock className="w-4 h-4" />
              <span>Abrir Turno de Caja</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsMovementModalOpen(true)}
                className="px-3.5 py-2 bg-surface2 hover:bg-surface3 text-heading font-semibold text-xs rounded-xl transition flex items-center space-x-1.5"
              >
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
                <span>Ingreso / Gasto</span>
              </button>

              <button
                onClick={() => {
                  setActualAmount(totals?.expectedCashInDrawer?.toString() || '');
                  setIsCloseModalOpen(true);
                }}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-500/20 transition flex items-center space-x-2"
              >
                <Lock className="w-4 h-4" />
                <span>Cerrar Turno de Caja</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ACTIVE SESSION METRICS */}
      {activeSession && totals && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface border border-surface2 p-5 rounded-2xl">
            <div className="text-xs text-secondary font-semibold">Monto Inicial en Caja</div>
            <div className="text-2xl font-bold font-mono text-heading mt-1">${totals.initialAmount.toFixed(2)}</div>
            <div className="text-[11px] text-muted mt-1">Apertura: {new Date(activeSession.openedAt).toLocaleTimeString('es-AR')}</div>
          </div>

          <div className="bg-surface border border-surface2 p-5 rounded-2xl">
            <div className="text-xs text-secondary font-semibold">Ventas en Efectivo</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">${totals.totalSalesCash.toFixed(2)}</div>
            <div className="text-[11px] text-muted mt-1">Ingreso físico directo a caja</div>
          </div>

          <div className="bg-surface border border-surface2 p-5 rounded-2xl">
            <div className="text-xs text-secondary font-semibold">Otros Medios (Tarjeta/MP/Transf)</div>
            <div className="text-2xl font-bold font-mono text-teal-400 mt-1">
              ${(totals.totalSalesAllMethods - totals.totalSalesCash - totals.totalSalesAccount).toFixed(2)}
            </div>
            <div className="text-[11px] text-muted mt-1">Banco / Mercado Pago</div>
          </div>

          <div className="bg-surface border border-emerald-500/30 p-5 rounded-2xl bg-emerald-950/20">
            <div className="text-xs text-emerald-400 font-semibold">Efectivo Esperado en Arqueo</div>
            <div className="text-3xl font-bold font-mono text-emerald-400 mt-1">${totals.expectedCashInDrawer.toFixed(2)}</div>
            <div className="text-[11px] text-emerald-500/80 mt-1">Calculado en tiempo real</div>
          </div>
        </div>
      )}

      {/* DISCRIMINATED PAYMENT BREAKDOWN */}
      {totals && (
        <div className="bg-surface border border-surface2 rounded-2xl p-6">
          <h3 className="text-base font-bold text-heading mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-400" />
            Desglose de Caja por Medio de Pago (Turno Actual)
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="bg-app p-3.5 rounded-xl border border-surface2">
              <div className="text-xs text-secondary">Efectivo</div>
              <div className="text-lg font-bold font-mono text-heading mt-1">${totals.totalSalesCash.toFixed(2)}</div>
            </div>

            <div className="bg-app p-3.5 rounded-xl border border-surface2">
              <div className="text-xs text-secondary">Tarjeta Débito</div>
              <div className="text-lg font-bold font-mono text-heading mt-1">${totals.totalSalesDebit.toFixed(2)}</div>
            </div>

            <div className="bg-app p-3.5 rounded-xl border border-surface2">
              <div className="text-xs text-secondary">Tarjeta Crédito</div>
              <div className="text-lg font-bold font-mono text-heading mt-1">${totals.totalSalesCredit.toFixed(2)}</div>
            </div>

            <div className="bg-app p-3.5 rounded-xl border border-surface2">
              <div className="text-xs text-secondary">Transferencia</div>
              <div className="text-lg font-bold font-mono text-heading mt-1">${totals.totalSalesTransfer.toFixed(2)}</div>
            </div>

            <div className="bg-app p-3.5 rounded-xl border border-surface2">
              <div className="text-xs text-secondary">Mercado Pago</div>
              <div className="text-lg font-bold font-mono text-heading mt-1">${totals.totalSalesMP.toFixed(2)}</div>
            </div>

            <div className="bg-app p-3.5 rounded-xl border border-surface2">
              <div className="text-xs text-secondary">Cta. Corriente</div>
              <div className="text-lg font-bold font-mono text-amber-400 mt-1">${totals.totalSalesAccount.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* PAST CLOSINGS HISTORY */}
      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-surface2 flex items-center justify-between">
          <h3 className="text-base font-bold text-heading flex items-center gap-2">
            <History className="w-5 h-5 text-secondary" />
            Historial de Cierres de Caja Anteriores
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">ID Sesión</th>
                <th className="p-4">Abierta Por</th>
                <th className="p-4">Fecha / Hora Cierre</th>
                <th className="p-4 text-right">Inicial</th>
                <th className="p-4 text-right">Esperado</th>
                <th className="p-4 text-right">Declarado</th>
                <th className="p-4 text-right">Diferencia</th>
                <th className="p-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted">
                    No hay historiales de caja registrados.
                  </td>
                </tr>
              ) : (
                history.map((s: any) => {
                  const diff = s.difference || 0;
                  return (
                    <tr key={s.id} className="hover:bg-surface2/40 transition">
                      <td className="p-4 font-mono text-xs text-teal-400 font-bold">#{s.id}</td>
                      <td className="p-4 text-heading">{s.openedByUser?.name}</td>
                      <td className="p-4 text-xs text-secondary">
                        {s.closedAt ? new Date(s.closedAt).toLocaleString('es-AR') : 'Turno Activo'}
                      </td>
                      <td className="p-4 text-right font-mono">${s.initialAmount.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono">${s.expectedAmount ? s.expectedAmount.toFixed(2) : '-'}</td>
                      <td className="p-4 text-right font-mono font-bold">${s.actualAmount ? s.actualAmount.toFixed(2) : '-'}</td>
                      <td className="p-4 text-right font-mono font-bold">
                        {s.status === 'CLOSED' ? (
                          <span className={diff < 0 ? 'text-red-400' : diff > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                            ${diff.toFixed(2)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            s.status === 'OPEN'
                              ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                              : 'bg-surface2 text-secondary'
                          }`}
                        >
                          {s.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OPEN CASH MODAL */}
      <Modal isOpen={isOpenModalOpen} onClose={() => setIsOpenModalOpen(false)} title="🔓 Abrir Turno de Caja">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            openCashMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Monto Inicial en Efectivo ($)</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={initialAmount}
              onChange={(e) => setInitialAmount(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
            <button
              type="button"
              onClick={() => setIsOpenModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={openCashMutation.isPending}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20"
            >
              Confirmar Apertura
            </button>
          </div>
        </form>
      </Modal>

      {/* CLOSE CASH MODAL */}
      <Modal isOpen={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)} title="🔒 Arqueo y Cierre de Caja">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            closeCashMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="p-3 bg-app border border-surface2 rounded-xl space-y-1 text-xs">
            <div className="flex justify-between text-secondary">
              <span>Efectivo Esperado en Arqueo:</span>
              <span className="font-mono font-bold text-teal-400">${totals?.expectedCashInDrawer.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Monto Real Contado en Arqueo ($) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-base text-heading font-mono font-bold focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Notas / Observaciones de Cierre</label>
            <input
              type="text"
              placeholder="Ej: Se dejaron $5000 para cambio del turno mañana"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
            <button
              type="button"
              onClick={() => setIsCloseModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={closeCashMutation.isPending}
              className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-500/20"
            >
              Finalizar y Cerrar Turno
            </button>
          </div>
        </form>
      </Modal>

      {/* MANUAL MOVEMENT MODAL */}
      <Modal isOpen={isMovementModalOpen} onClose={() => setIsMovementModalOpen(false)} title="➕ Registrar Movimiento de Caja">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMovementMutation.mutate();
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
              <option value="EXPENSE">Egreso / Gasto Varios (-)</option>
              <option value="MANUAL_IN">Ingreso Manual de Dinero (+)</option>
              <option value="WITHDRAWAL">Retiro de Caja (-)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Monto ($) *</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={movementAmount}
              onChange={(e) => setMovementAmount(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-body mb-1">Motivo / Concepto *</label>
            <input
              type="text"
              required
              placeholder="Ej: Pago de flete, compras menores de limpieza, etc."
              value={movementNotes}
              onChange={(e) => setMovementNotes(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
            <button
              type="button"
              onClick={() => setIsMovementModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={addMovementMutation.isPending}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-lg shadow-teal-500/20"
            >
              Guardar Movimiento
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
