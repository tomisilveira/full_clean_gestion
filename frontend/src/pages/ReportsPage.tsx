import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Package,
  Calendar,
  Download,
  CreditCard,
  Users,
  AlertTriangle,
} from 'lucide-react';

// Format currency
const fmt = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  DEBIT: 'Tarjeta Débito',
  CREDIT: 'Tarjeta Crédito',
  TRANSFER: 'Transferencia',
  MERCADO_PAGO: 'Mercado Pago',
  CURRENT_ACCOUNT: 'Cuenta Corriente',
};

export const ReportsPage: React.FC = () => {
  const { user, activeSucursal } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const today = new Date().toISOString().slice(0, 10);
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'profitability' | 'stock'>('overview');
  const [scope, setScope] = useState<'mine' | 'all'>('mine'); // solo relevante para ADMIN

  const scopeParams = isAdmin && scope === 'all' ? { all: 'true' } : {};

  const { data: dashboardData } = useQuery({
    queryKey: ['reportDashboard', scope],
    queryFn: async () => (await api.get('/reports/dashboard', { params: scopeParams })).data,
    refetchInterval: 30000,
  });

  const { data: salesReport, isLoading: isLoadingSales } = useQuery({
    queryKey: ['reportSales', startDate, endDate, scope],
    queryFn: async () => (await api.get('/reports/sales', { params: { startDate, endDate, ...scopeParams } })).data,
  });

  const { data: profitabilityData, isLoading: isLoadingProfit } = useQuery({
    queryKey: ['reportProfitability', scope],
    queryFn: async () => (await api.get('/reports/profitability', { params: scopeParams })).data,
  });

  const { data: stockValue } = useQuery({
    queryKey: ['reportStockValue', scope],
    queryFn: async () => (await api.get('/reports/stock-value', { params: scopeParams })).data,
  });

  const { data: lowStockProducts = [] } = useQuery({
    queryKey: ['lowStockProducts', scope],
    queryFn: async () => (await api.get('/products/low-stock', { params: isAdmin && scope === 'all' ? { all: 'true' } : {} })).data,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
          <BarChart3 className="w-7 h-7 text-teal-400" />
          Reportes y Métricas del Negocio
        </h1>
        <p className="text-xs text-secondary mt-1">
          Análisis de facturación, rentabilidad, stock valorizado y cuentas corrientes.
          {!isAdmin && <> Sucursal: <span className="text-teal-400 font-semibold">{activeSucursal?.nombre}</span>.</>}
        </p>
      </div>

      {isAdmin && (
        <div className="flex gap-1 bg-surface border border-surface2 p-1 rounded-xl w-fit">
          <button
            onClick={() => setScope('mine')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${scope === 'mine' ? 'bg-teal-600 text-white shadow-md' : 'text-secondary hover:text-heading'}`}
          >
            {activeSucursal?.nombre}
          </button>
          <button
            onClick={() => setScope('all')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${scope === 'all' ? 'bg-teal-600 text-white shadow-md' : 'text-secondary hover:text-heading'}`}
          >
            Todas las Sucursales (Consolidado)
          </button>
        </div>
      )}

      {/* KPI Cards - Today */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-surface2 p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-secondary font-semibold uppercase tracking-wide">Ventas Hoy</div>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {fmt(dashboardData?.todaySalesTotal || 0)}
          </div>
          <div className="text-[11px] text-muted mt-1">{dashboardData?.todaySalesCount || 0} transacciones</div>
        </div>

        <div className="bg-surface border border-surface2 p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-secondary font-semibold uppercase tracking-wide">Stock (Costo)</div>
            <Package className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-teal-400">
            {fmt(stockValue?.totalCostValuation || 0)}
          </div>
          <div className="text-[11px] text-muted mt-1">Inversión en depósito</div>
        </div>

        <div className="bg-surface border border-surface2 p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-secondary font-semibold uppercase tracking-wide">Ctas. Ctes.</div>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            {fmt(dashboardData?.totalCustomerBalance || 0)}
          </div>
          <div className="text-[11px] text-muted mt-1">Saldo a cobrar clientes</div>
        </div>

        <div className={`bg-surface p-5 rounded-2xl border ${
          lowStockProducts.length > 0 ? 'border-amber-800/60' : 'border-surface2'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-secondary font-semibold uppercase tracking-wide">Stock Bajo</div>
            <AlertTriangle className={`w-4 h-4 ${lowStockProducts.length > 0 ? 'text-amber-400' : 'text-faint'}`} />
          </div>
          <div className={`text-2xl font-bold font-mono ${
            lowStockProducts.length > 0 ? 'text-amber-400' : 'text-secondary'
          }`}>
            {lowStockProducts.length}
          </div>
          <div className="text-[11px] text-muted mt-1">Productos bajo mínimo</div>
        </div>
      </div>

      {/* Date range filter */}
      <div className="bg-surface border border-surface2 rounded-2xl p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-secondary">
          <Calendar className="w-4 h-4 text-teal-400" />
          <span className="font-semibold">Período de análisis:</span>
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

        {/* Quick range buttons */}
        <div className="flex gap-2 ml-auto flex-wrap">
          {[
            { label: 'Hoy', days: 0 },
            { label: 'Últ. 7 días', days: 7 },
            { label: 'Este mes', days: -1 },
            { label: 'Últ. 30 días', days: 30 },
          ].map((range) => (
            <button
              key={range.label}
              onClick={() => {
                const end = new Date();
                const start = new Date();
                if (range.days === 0) {
                  // Today
                  setStartDate(end.toISOString().slice(0, 10));
                } else if (range.days === -1) {
                  // This month
                  start.setDate(1);
                  setStartDate(start.toISOString().slice(0, 10));
                } else {
                  start.setDate(end.getDate() - range.days);
                  setStartDate(start.toISOString().slice(0, 10));
                }
                setEndDate(end.toISOString().slice(0, 10));
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surface2 hover:bg-surface3 text-body transition border border-surface3"
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-surface2 p-1 rounded-xl w-fit">
        {[
          { key: 'overview', label: 'Resumen de Ventas' },
          { key: 'products', label: 'Top Productos' },
          { key: 'profitability', label: 'Rentabilidad' },
          { key: 'stock', label: 'Stock Valorizado' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === tab.key
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-secondary hover:text-heading'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Period Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 bg-surface border border-emerald-800/40 p-5 rounded-2xl space-y-3">
              <h3 className="text-sm font-bold text-emerald-400">Total del Período</h3>
              <div className="text-3xl font-bold font-mono text-emerald-400">
                {isLoadingSales ? '...' : fmt(salesReport?.totalRevenue || 0)}
              </div>
              <div className="text-xs text-secondary">
                {salesReport?.salesCount || 0} ventas completadas
              </div>
            </div>

            {/* Payment breakdown */}
            <div className="md:col-span-2 bg-surface border border-surface2 p-5 rounded-2xl">
              <h3 className="text-sm font-bold text-body mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-teal-400" />
                Desglose por Medio de Pago
              </h3>

              {isLoadingSales ? (
                <div className="text-muted text-sm">Cargando...</div>
              ) : (
                <div className="space-y-2.5">
                  {salesReport?.paymentMethodsSummary &&
                    Object.entries(salesReport.paymentMethodsSummary)
                      .filter(([, amount]) => (amount as number) > 0)
                      .sort((a, b) => (b[1] as number) - (a[1] as number))
                      .map(([method, amount]) => {
                        const total = salesReport.totalRevenue || 1;
                        const pct = Math.round(((amount as number) / total) * 100);

                        return (
                          <div key={method}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-body font-medium">
                                {PAYMENT_METHOD_LABELS[method] || method}
                              </span>
                              <span className="font-mono font-bold text-heading">
                                {fmt(amount as number)}
                                <span className="text-muted ml-2">({pct}%)</span>
                              </span>
                            </div>
                            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}

                  {(!salesReport?.paymentMethodsSummary ||
                    Object.values(salesReport.paymentMethodsSummary).every((v) => v === 0)) && (
                    <div className="text-muted text-sm">No hay ventas en el período seleccionado.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {scope === 'all' && salesReport?.bySucursal?.length > 0 && (
            <div className="bg-surface border border-surface2 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-body mb-3">Ventas por Sucursal</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {salesReport.bySucursal.map((s: any) => (
                  <div key={s.nombre} className="bg-app p-3.5 rounded-xl border border-surface2 flex justify-between items-center">
                    <span className="text-sm text-body">{s.nombre}</span>
                    <div className="text-right">
                      <div className="font-mono font-bold text-teal-400">{fmt(s.total)}</div>
                      <div className="text-[11px] text-muted">{s.count} ventas</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'products' && (
        <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-surface2 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-400" />
            <h3 className="text-base font-bold text-heading">Top 10 Productos Más Vendidos</h3>
            <span className="text-xs text-muted ml-2">
              {startDate} → {endDate}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-body">
              <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
                <tr>
                  <th className="p-4">#</th>
                  <th className="p-4">Producto</th>
                  <th className="p-4 text-center">Unidades Vendidas</th>
                  <th className="p-4 text-right">Recaudación Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface2/60">
                {isLoadingSales ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted">Cargando...</td>
                  </tr>
                ) : (salesReport?.topProducts?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted">
                      Sin ventas en el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  salesReport.topProducts.map((p: any, idx: number) => (
                    <tr key={idx} className="hover:bg-surface2/40 transition">
                      <td className="p-4 text-muted font-mono font-bold">#{idx + 1}</td>
                      <td className="p-4 font-semibold text-heading">{p.name}</td>
                      <td className="p-4 text-center font-mono font-bold text-teal-400">{p.quantity}</td>
                      <td className="p-4 text-right font-mono font-bold text-heading">{fmt(p.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'profitability' && (
        <div className="bg-surface border border-surface2 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-surface2">
            <h3 className="text-base font-bold text-heading">Rentabilidad por Producto (Stock Actual)</h3>
            <p className="text-xs text-secondary mt-1">Margen bruto calculado sobre el stock disponible actualmente.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-body">
              <thead className="bg-app/80 text-xs uppercase font-semibold text-secondary border-b border-surface2">
                <tr>
                  <th className="p-4">Producto</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4 text-right">Costo</th>
                  <th className="p-4 text-right">P. Venta</th>
                  <th className="p-4 text-right">Margen %</th>
                  <th className="p-4 text-right">Stock</th>
                  <th className="p-4 text-right">Ganancia Potencial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface2/60">
                {isLoadingProfit ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">Cargando...</td>
                  </tr>
                ) : (profitabilityData?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">Sin datos disponibles.</td>
                  </tr>
                ) : (
                  (profitabilityData as any[])
                    .sort((a, b) => b.marginPercentage - a.marginPercentage)
                    .map((p) => (
                      <tr key={p.id} className="hover:bg-surface2/40 transition">
                        <td className="p-4 font-semibold text-heading max-w-xs truncate">{p.name}</td>
                        <td className="p-4 text-secondary text-xs">{p.category}</td>
                        <td className="p-4 text-right font-mono text-sm">{fmt(p.costPrice)}</td>
                        <td className="p-4 text-right font-mono text-sm font-bold text-heading">{fmt(p.salePrice)}</td>
                        <td className="p-4 text-right">
                          <span
                            className={`font-mono font-bold ${
                              p.marginPercentage >= 30
                                ? 'text-emerald-400'
                                : p.marginPercentage >= 15
                                ? 'text-amber-400'
                                : 'text-red-400'
                            }`}
                          >
                            {p.marginPercentage.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono text-secondary">{p.currentStock}</td>
                        <td className="p-4 text-right font-mono font-bold text-teal-400">
                          {fmt(p.totalPotentialProfit)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'stock' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface border border-surface2 p-5 rounded-2xl">
              <div className="text-xs text-secondary mb-2">Total Productos en Catálogo</div>
              <div className="text-2xl font-bold font-mono text-heading">
                {stockValue?.totalProductsCount || 0}
              </div>
            </div>
            <div className="bg-surface border border-surface2 p-5 rounded-2xl">
              <div className="text-xs text-secondary mb-2">Valuación a Costo</div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                {fmt(stockValue?.totalCostValuation || 0)}
              </div>
              <div className="text-[11px] text-muted mt-1">Capital invertido en mercadería</div>
            </div>
            <div className="bg-surface border border-emerald-800/40 p-5 rounded-2xl">
              <div className="text-xs text-emerald-400 mb-2">Ganancia Bruta Proyectada</div>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {fmt(stockValue?.expectedGrossProfit || 0)}
              </div>
              <div className="text-[11px] text-muted mt-1">
                Si se vende todo al precio de lista
              </div>
            </div>
          </div>

          {/* Low Stock Alert Table */}
          {lowStockProducts.length > 0 && (
            <div className="bg-amber-950/20 border border-amber-800/60 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-amber-800/40 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-amber-300">
                  Productos que Necesitan Reposición ({lowStockProducts.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-body">
                  <thead className="text-xs text-secondary border-b border-amber-800/30">
                    <tr>
                      <th className="p-3 text-left">Producto</th>
                      <th className="p-3 text-right">Stock Actual</th>
                      <th className="p-3 text-right">Stock Mínimo</th>
                      <th className="p-3 text-center">Proveedor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-900/20">
                    {lowStockProducts.map((p: any) => (
                      <tr key={p.id} className="hover:bg-amber-900/10">
                        <td className="p-3 font-semibold text-heading">{p.name}</td>
                        <td className="p-3 text-right font-mono font-bold text-red-400">
                          {p.currentStock} {p.unit}
                        </td>
                        <td className="p-3 text-right font-mono text-secondary">
                          {p.minStock} {p.unit}
                        </td>
                        <td className="p-3 text-center text-secondary text-xs">
                          {p.supplier?.name || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
