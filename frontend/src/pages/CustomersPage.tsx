import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { toastSuccess } from '../store/useToastStore';
import { Users, Plus, DollarSign, History, Search } from 'lucide-react';

export const CustomersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  // Form states
  const [name, setName] = useState('');
  const [cuitDni, setCuitDni] = useState('');
  const [ivaCondition, setIvaCondition] = useState('Consumidor Final');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [priceList, setPriceList] = useState('RETAIL');
  const [creditLimit, setCreditLimit] = useState('0');

  // Payment Form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [registerInCash, setRegisterInCash] = useState(true);

  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
  });

  const { data: historyData } = useQuery({
    queryKey: ['customerHistory', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return null;
      return (await api.get(`/customers/${selectedCustomer.id}/account`)).data;
    },
    enabled: Boolean(selectedCustomer && isHistoryModalOpen),
  });

  const saveCustomerMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        cuitDni,
        ivaCondition,
        phone,
        email,
        address,
        priceList,
        creditLimit: parseFloat(creditLimit || '0'),
      };
      if (selectedCustomer) {
        return (await api.put(`/customers/${selectedCustomer.id}`, payload)).data;
      } else {
        return (await api.post('/customers', payload)).data;
      }
    },
    onSuccess: () => {
      setIsCustomerModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toastSuccess(selectedCustomer ? 'Cliente actualizado correctamente.' : 'Cliente creado correctamente.');
    },
  });

  const savePaymentMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`/customers/${selectedCustomer.id}/payments`, {
          amount: parseFloat(paymentAmount),
          paymentMethod,
          notes: paymentNotes,
          registerInCash,
        })
      ).data;
    },
    onSuccess: () => {
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentNotes('');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['currentCash'] });
      toastSuccess('Cobro registrado correctamente.');
    },
  });

  const filteredCustomers = customers.filter((c: any) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.cuitDni && c.cuitDni.includes(search))
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <Users className="w-7 h-7 text-teal-400" />
            Clientes y Cuentas Corrientes
          </h1>
          <p className="text-xs text-secondary mt-1">
            Gestión de clientes mayoristas y recurrentes, listas de precios asignadas y saldos de cuenta corriente.
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedCustomer(null);
            setName('');
            setCuitDni('');
            setIvaCondition('Consumidor Final');
            setPhone('');
            setEmail('');
            setAddress('');
            setPriceList('RETAIL');
            setCreditLimit('0');
            setIsCustomerModalOpen(true);
          }}
          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente por nombre o CUIT/DNI..."
          className="w-full bg-surface border border-surface2 rounded-xl pl-9 pr-4 py-2.5 text-sm text-heading placeholder-muted focus:outline-none focus:border-teal-500"
        />
      </div>

      <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-body">
            <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
              <tr>
                <th className="p-4">Cliente / Razón Social</th>
                <th className="p-4">CUIT / DNI</th>
                <th className="p-4">Condición IVA</th>
                <th className="p-4">Lista Asignada</th>
                <th className="p-4 text-right">Saldo Cta. Cte.</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface2/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    Cargando clientes...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    No se encontraron clientes.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c: any) => (
                  <tr key={c.id} className="hover:bg-surface2/40 transition">
                    <td className="p-4">
                      <div className="font-semibold text-heading">{c.name}</div>
                      {c.phone && <div className="text-xs text-muted">{c.phone}</div>}
                    </td>
                    <td className="p-4 font-mono text-xs text-secondary">{c.cuitDni || '-'}</td>
                    <td className="p-4 text-secondary">{c.ivaCondition}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          c.priceList === 'WHOLESALE' ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-surface2 text-secondary'
                        }`}
                      >
                        {c.priceList === 'WHOLESALE' ? 'Mayorista' : 'Minorista'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono font-bold">
                      <span className={c.balance > 0 ? 'text-amber-400' : c.balance < 0 ? 'text-emerald-400' : 'text-secondary'}>
                        ${c.balance.toFixed(2)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedCustomer(c);
                            setIsPaymentModalOpen(true);
                          }}
                          title="Registrar Entrega de Dinero / Pago"
                          className="px-2.5 py-1 bg-teal-600/20 hover:bg-teal-600 text-accent hover:text-white text-xs font-semibold rounded-lg transition flex items-center space-x-1"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Cobrar</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedCustomer(c);
                            setIsHistoryModalOpen(true);
                          }}
                          title="Ver Historial de Cta Cte"
                          className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-body transition"
                        >
                          <History className="w-4 h-4" />
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

      {/* CREATE / EDIT CUSTOMER MODAL */}
      <Modal isOpen={isCustomerModalOpen} onClose={() => setIsCustomerModalOpen(false)} title="Crear / Editar Cliente">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCustomerMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-body mb-1">Nombre / Razón Social *</label>
            <input
              type="text"
              required
              placeholder="Ej: Limpieza SRL"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">CUIT / DNI</label>
              <input
                type="text"
                placeholder="20-30000000-9"
                value={cuitDni}
                onChange={(e) => setCuitDni(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Condición frente al IVA</label>
              <select
                value={ivaCondition}
                onChange={(e) => setIvaCondition(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="Consumidor Final">Consumidor Final</option>
                <option value="Responsable Inscripto">Responsable Inscripto</option>
                <option value="Monotributo">Monotributo</option>
                <option value="Exento">Exento</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-body mb-1">Lista de Precios Asignada</label>
              <select
                value={priceList}
                onChange={(e) => setPriceList(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="RETAIL">Mostrador / Minorista</option>
                <option value="WHOLESALE">Mayorista</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Límite de Crédito ($)</label>
              <input
                type="number"
                step="0.01"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading font-mono focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
            <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={saveCustomerMutation.isPending} className="px-5 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm">
              Guardar Cliente
            </button>
          </div>
        </form>
      </Modal>

      {/* REGISTER PAYMENT MODAL */}
      {selectedCustomer && (
        <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={`Registrar Cobro: ${selectedCustomer.name}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePaymentMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="p-3 bg-app border border-surface2 rounded-xl flex justify-between items-center text-xs">
              <span className="text-secondary">Saldo Pendiente Actual:</span>
              <span className="font-mono font-bold text-amber-400 text-sm">${selectedCustomer.balance.toFixed(2)}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Monto Entregado ($) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-base text-heading font-mono font-bold focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-body mb-1">Medio de Pago</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500"
              >
                <option value="CASH">Efectivo</option>
                <option value="TRANSFER">Transferencia Bancaria</option>
                <option value="DEBIT">Tarjeta Débito</option>
                <option value="CREDIT">Tarjeta Crédito</option>
                <option value="MERCADO_PAGO">Mercado Pago</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="regCash"
                checked={registerInCash}
                onChange={(e) => setRegisterInCash(e.target.checked)}
                className="rounded bg-surface2 border-surface3 text-teal-600 focus:ring-0"
              />
              <label htmlFor="regCash" className="text-xs text-body">
                Registrar ingreso de efectivo en el turno de caja abierto
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-3 border-t border-surface2">
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 rounded-lg bg-surface2 text-body text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={savePaymentMutation.isPending} className="px-5 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm">
                Confirmar Cobro
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ACCOUNT MOVEMENTS HISTORY MODAL */}
      {selectedCustomer && historyData && (
        <Modal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} title={`Historial Cta. Cte.: ${selectedCustomer.name}`} maxWidth="lg">
          <div className="space-y-3">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs text-body">
                <thead className="bg-app text-secondary border-b border-surface2">
                  <tr>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Concepto</th>
                    <th className="p-3 text-right">Monto</th>
                    <th className="p-3 text-right">Saldo Posterior</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface2">
                  {historyData.movements.map((m: any) => (
                    <tr key={m.id}>
                      <td className="p-3">{new Date(m.createdAt).toLocaleString('es-AR')}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-bold ${m.type === 'CHARGE_DEBT' ? 'bg-amber-950 text-amber-300' : 'bg-emerald-950 text-emerald-300'}`}>
                          {m.type === 'CHARGE_DEBT' ? 'DEUDA' : 'PAGO'}
                        </span>
                      </td>
                      <td className="p-3">{m.notes || '-'}</td>
                      <td className="p-3 text-right font-mono">${m.amount.toFixed(2)}</td>
                      <td className="p-3 text-right font-mono font-bold">${m.balanceAfter.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
