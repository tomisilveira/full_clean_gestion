import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { downloadFile } from '../utils/download';
import { Modal } from '../components/Modal';
import { toastSuccess } from '../store/useToastStore';
import { Settings, Save, CheckCircle2, Building2, Users, Plus, ShieldAlert, UploadCloud, FileCheck2, Download, Database, KeyRound } from 'lucide-react';

type Tab = 'empresa' | 'sucursales' | 'usuarios' | 'exportar';

export const ConfigPage: React.FC = () => {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('empresa');

  if (user?.role !== 'ADMIN') {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <p className="text-body">Solo un administrador puede acceder a la configuración del sistema.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
          <Settings className="w-7 h-7 text-teal-400" />
          Configuración del Sistema
        </h1>
        <p className="text-xs text-secondary mt-1">
          Datos de la empresa, sucursales (stock/caja/ARCA independientes) y usuarios.
        </p>
      </div>

      <div className="flex gap-2 border-b border-surface2">
        {([
          ['empresa', 'Empresa', Settings],
          ['sucursales', 'Sucursales', Building2],
          ['usuarios', 'Usuarios', Users],
          ['exportar', 'Exportar Datos', Download],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
              tab === key ? 'border-teal-500 text-accent' : 'border-transparent text-secondary hover:text-heading'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'empresa' && <EmpresaTab />}
      {tab === 'sucursales' && <SucursalesTab />}
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'exportar' && <ExportarTab />}
    </div>
  );
};

const ExportarTab: React.FC = () => {
  const exportables = [
    { key: 'customers.csv', label: 'Clientes', desc: 'Listado completo con saldo de cuenta corriente.' },
    { key: 'suppliers.csv', label: 'Proveedores', desc: 'Listado completo con saldo de deuda.' },
    { key: 'products.csv', label: 'Productos', desc: 'Catálogo con precios y stock por sucursal.' },
    { key: 'sales.csv', label: 'Ventas', desc: 'Historial completo de ventas (todas las sucursales).' },
    { key: 'purchases.csv', label: 'Compras', desc: 'Historial completo de compras a proveedores.' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-surface2 rounded-2xl p-6 space-y-4 shadow-xl">
        <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider border-b border-surface2 pb-2">
          Exportar Datos (CSV)
        </h3>
        <p className="text-xs text-secondary">
          Descarga en formato CSV (se abre directo en Excel) de cada sección del sistema. Solo disponible para administradores.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {exportables.map((e) => (
            <button
              key={e.key}
              onClick={() => downloadFile(`/export/${e.key}`, e.key)}
              className="flex items-center justify-between gap-3 p-4 bg-app border border-surface2 rounded-xl hover:border-teal-600 transition text-left"
            >
              <div>
                <div className="text-sm font-bold text-heading">{e.label}</div>
                <div className="text-[11px] text-secondary mt-0.5">{e.desc}</div>
              </div>
              <Download className="w-4 h-4 text-teal-400 shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-amber-800/50 rounded-2xl p-6 space-y-3 shadow-xl">
        <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider border-b border-surface2 pb-2 flex items-center gap-2">
          <Database className="w-4 h-4" /> Backup Completo de la Base de Datos
        </h3>
        <p className="text-xs text-secondary">
          Descarga un archivo JSON con absolutamente todos los datos del sistema (empresa, sucursales, productos,
          clientes, proveedores, ventas, compras, caja, presupuestos, comprobantes ARCA). No incluye contraseñas.
          Es información muy sensible — guardalo en un lugar seguro y no lo compartas.
        </p>
        <button
          onClick={() => downloadFile('/export/full', 'full_clean_backup.json')}
          className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2"
        >
          <Database className="w-4 h-4" />
          Descargar Backup Completo (JSON)
        </button>
      </div>
    </div>
  );
};

const inputCls = 'w-full bg-surface2 border border-surface3 rounded-lg px-3 py-2 text-sm text-heading focus:outline-none focus:border-teal-500';
const labelCls = 'block text-xs font-semibold text-body mb-1';

const EmpresaTab: React.FC = () => {
  const [businessName, setBusinessName] = useState('');
  const [cuit, setCuit] = useState('');
  const [ivaCondition, setIvaCondition] = useState('Responsable Inscripto');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [arcaHomo, setArcaHomo] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['companyConfig'],
    queryFn: async () => (await api.get('/config')).data,
  });

  useEffect(() => {
    if (config) {
      setBusinessName(config.businessName || '');
      setCuit(config.cuit || '');
      setIvaCondition(config.ivaCondition || 'Responsable Inscripto');
      setAddress(config.address || '');
      setPhone(config.phone || '');
      setEmail(config.email || '');
      setLogoUrl(config.logoUrl || '');
      setArcaHomo(config.arcaHomo !== undefined ? config.arcaHomo : true);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await api.put('/config', { businessName, cuit, ivaCondition, address, phone, email, logoUrl: logoUrl || null, arcaHomo })).data,
    onSuccess: () => {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['companyConfig'] });
    },
  });

  return (
    <>
      {savedSuccess && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-xl flex items-center space-x-2 text-sm font-semibold">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>Configuración guardada correctamente.</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="bg-surface border border-surface2 rounded-2xl p-6 space-y-6 shadow-xl"
      >
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider border-b border-surface2 pb-2">
            Datos de la Empresa (a nivel general, no por sucursal)
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Razón Social / Nombre Comercial *</label>
              <input type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>CUIT Contribuyente *</label>
              <input type="text" required value={cuit} onChange={(e) => setCuit(e.target.value)} className={`${inputCls} font-mono`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Condición frente al IVA</label>
              <select value={ivaCondition} onChange={(e) => setIvaCondition(e.target.value)} className={inputCls}>
                <option value="Responsable Inscripto">Responsable Inscripto</option>
                <option value="Monotributo">Monotributo</option>
                <option value="Exento">Exento</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Teléfono de Contacto</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Domicilio Fiscal (Casa Central)</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>URL del Logo (para tickets y encabezado)</label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="/logo.png"
                className={`${inputCls} font-mono`}
              />
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Vista previa"
                  className="w-10 h-10 object-contain rounded border border-surface3 bg-surface2 shrink-0"
                  onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
                />
              )}
            </div>
            <p className="text-[11px] text-secondary mt-1">
              Colocá el archivo en <code className="font-mono">frontend/public/logo.png</code> y escribí acá <code className="font-mono">/logo.png</code>, o pegá una URL absoluta si el logo está alojado en otro lado.
            </p>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider border-b border-surface2 pb-2">
            Facturación Electrónica ARCA (ex AFIP)
          </h3>
          <p className="text-xs text-secondary">
            El punto de venta ya no es global: se configura por sucursal en la pestaña <b>Sucursales</b>. Este entorno
            (homologación/producción) aplica a toda la empresa (mismo certificado y CUIT).
          </p>
          <div>
            <label className={labelCls}>Entorno de ARCA / AFIP</label>
            <select
              value={arcaHomo ? 'true' : 'false'}
              onChange={(e) => setArcaHomo(e.target.value === 'true')}
              className={`${inputCls} font-semibold max-w-xs`}
            >
              <option value="true">Homologación (Testing / Pruebas)</option>
              <option value="false">Producción (Comprobantes Reales)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-surface2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center space-x-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saveMutation.isPending ? 'Guardando...' : 'Guardar Configuración'}</span>
          </button>
        </div>
      </form>

      <ArcaCertUploadSection />
    </>
  );
};

// Sube el certificado (.crt) y/o la clave privada (.key) de ARCA para un ambiente dado.
// Se guardan directamente en el servidor (backend/certs/); la clave privada nunca se
// expone de vuelta al frontend, solo se informa si está cargada o no.
const ArcaCertUploadSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['arcaCertStatus'],
    queryFn: async () => (await api.get('/config/arca-cert/status')).data,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['arcaCertStatus'] });

  return (
    <div className="bg-surface border border-surface2 rounded-2xl p-6 space-y-5 shadow-xl">
      <div>
        <h3 className="text-sm font-bold text-teal-400 uppercase tracking-wider border-b border-surface2 pb-2 mb-2">
          Certificado Digital ARCA
        </h3>
        <p className="text-xs text-secondary">
          Subí el certificado (.crt) y la clave privada (.key) que generás en{' '}
          <span className="font-mono">arca.gob.ar → Administración de Certificados Digitales</span>. Quedan guardados
          únicamente en este servidor, nunca se suben a ningún otro lado.
        </p>
      </div>

      <CertUploadRow environment="homologacion" label="Homologación (Testing)" status={status?.homologacion} onUploaded={refresh} />
      <CertUploadRow environment="produccion" label="Producción" status={status?.produccion} onUploaded={refresh} />
    </div>
  );
};

const CertUploadRow: React.FC<{ environment: 'homologacion' | 'produccion'; label: string; status: any; onUploaded: () => void }> = ({
  environment,
  label,
  status,
  onUploaded,
}) => {
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (certFile) formData.append('certFile', certFile);
      if (keyFile) formData.append('keyFile', keyFile);

      // Se usa fetch en vez del cliente axios: al enviar FormData, el navegador tiene que
      // fijar el header Content-Type con el boundary correcto automáticamente, y eso solo
      // pasa de forma confiable si no fijamos nosotros mismos ningún Content-Type.
      const token = localStorage.getItem('full_clean_token');
      const res = await fetch(`/api/config/arca-cert/${environment}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al subir el certificado.');
      return data;
    },
    onSuccess: () => {
      setCertFile(null);
      setKeyFile(null);
      setError('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUploaded();
    },
    onError: (err: any) => setError(err.message || 'Error al subir el certificado.'),
  });

  return (
    <div className="p-4 bg-app rounded-xl border border-surface2 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="font-semibold text-heading text-sm">{label}</span>
        <div className="flex gap-2">
          <StatusPill label=".crt" uploaded={status?.cert?.uploaded} />
          <StatusPill label=".key" uploaded={status?.key?.uploaded} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-secondary mb-1">Certificado (.crt)</label>
          <input
            type="file"
            accept=".crt,.pem"
            onChange={(e) => setCertFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-secondary file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-surface3 file:text-heading file:text-xs"
          />
        </div>
        <div>
          <label className="block text-[11px] text-secondary mb-1">Clave Privada (.key)</label>
          <input
            type="file"
            accept=".key,.pem"
            onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-secondary file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-surface3 file:text-heading file:text-xs"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-400 flex items-center gap-1"><FileCheck2 className="w-3.5 h-3.5" /> Certificado actualizado.</p>}

      <button
        type="button"
        onClick={() => uploadMutation.mutate()}
        disabled={(!certFile && !keyFile) || uploadMutation.isPending}
        className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
      >
        <UploadCloud className="w-3.5 h-3.5" />
        {uploadMutation.isPending ? 'Subiendo...' : 'Subir'}
      </button>
    </div>
  );
};

const StatusPill: React.FC<{ label: string; uploaded?: boolean }> = ({ label, uploaded }) => (
  <span
    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
      uploaded ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' : 'bg-surface2 border-surface3 text-secondary'
    }`}
  >
    {label} {uploaded ? '✓' : '—'}
  </span>
);

const SucursalesTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursalesAdmin'],
    queryFn: async () => (await api.get('/sucursales')).data,
  });

  const [creating, setCreating] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newDireccion, setNewDireccion] = useState('');
  const [newPtoVta, setNewPtoVta] = useState('1');

  const createMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/sucursales', { nombre: newNombre, direccion: newDireccion, ptoVtaArca: parseInt(newPtoVta) })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sucursalesAdmin'] });
      setCreating(false);
      setNewNombre('');
      setNewDireccion('');
      setNewPtoVta('1');
    },
  });

  return (
    <div className="space-y-4">
      {sucursales.map((s: any) => <SucursalRow key={s.id} sucursal={s} />)}

      {creating ? (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="bg-surface border border-teal-800/50 rounded-2xl p-5 space-y-3"
        >
          <h4 className="text-sm font-bold text-teal-400">Nueva Sucursal</h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Nombre *</label>
              <input required value={newNombre} onChange={(e) => setNewNombre(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Pto. Vta. ARCA</label>
              <input type="number" value={newPtoVta} onChange={(e) => setNewPtoVta(e.target.value)} className={`${inputCls} font-mono`} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Dirección</label>
            <input value={newDireccion} onChange={(e) => setNewDireccion(e.target.value)} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-secondary hover:text-heading">Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-lg">Crear</button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-surface3 rounded-xl text-secondary hover:text-teal-400 hover:border-teal-600 transition text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Agregar Sucursal
        </button>
      )}
    </div>
  );
};

const SucursalRow: React.FC<{ sucursal: any }> = ({ sucursal }) => {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(sucursal.nombre);
  const [direccion, setDireccion] = useState(sucursal.direccion || '');
  const [ptoVtaArca, setPtoVtaArca] = useState(String(sucursal.ptoVtaArca));
  const [ticketWidth, setTicketWidth] = useState(String(sucursal.ticketWidth));
  const [printerInterface, setPrinterInterface] = useState(sucursal.printerInterface);
  const [printerAddress, setPrinterAddress] = useState(sucursal.printerAddress || '');
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await api.put(`/sucursales/${sucursal.id}`, {
        nombre, direccion, ptoVtaArca: parseInt(ptoVtaArca), ticketWidth: parseInt(ticketWidth), printerInterface, printerAddress,
      })).data,
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ['sucursalesAdmin'] });
    },
  });

  return (
    <div className="bg-surface border border-surface2 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-heading flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-400" /> {sucursal.nombre}
          <span className="text-xs text-muted font-normal">({sucursal._count?.usuarios ?? 0} usuarios asignados)</span>
        </h4>
        {saved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Guardado</span>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Pto. Vta. ARCA</label>
          <input type="number" value={ptoVtaArca} onChange={(e) => setPtoVtaArca(e.target.value)} className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className={labelCls}>Ancho de Ticket</label>
          <select value={ticketWidth} onChange={(e) => setTicketWidth(e.target.value)} className={inputCls}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Dirección</label>
        <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Interfaz de Impresora</label>
          <select value={printerInterface} onChange={(e) => setPrinterInterface(e.target.value)} className={inputCls}>
            <option value="NONE">Ninguna (solo impresión por navegador)</option>
            <option value="NETWORK">Red (TCP/IP)</option>
            <option value="USB">USB</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Dirección de Impresora</label>
          <input
            value={printerAddress}
            onChange={(e) => setPrinterAddress(e.target.value)}
            placeholder="tcp://192.168.1.100:9100"
            className={`${inputCls} font-mono`}
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-4 py-2 bg-surface2 hover:bg-surface3 text-heading text-sm font-semibold rounded-lg flex items-center gap-2"
        >
          <Save className="w-3.5 h-3.5" /> Guardar
        </button>
      </div>
    </div>
  );
};

const UsuariosTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery({
    queryKey: ['usersAdmin'],
    queryFn: async () => (await api.get('/auth/users')).data,
  });
  const { data: sucursales = [] } = useQuery({
    queryKey: ['sucursalesAdmin'],
    queryFn: async () => (await api.get('/sucursales')).data,
  });

  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('VENDEDOR');
  const [sucursalIds, setSucursalIds] = useState<number[]>([]);

  // Cambio de contraseña de un usuario existente
  const [passwordTarget, setPasswordTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => (await api.post('/auth/users', { username, password, name, role, sucursalIds })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usersAdmin'] });
      setCreating(false);
      setUsername(''); setPassword(''); setName(''); setRole('VENDEDOR'); setSucursalIds([]);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => (await api.put(`/auth/users/${passwordTarget.id}`, { password: newPassword })).data,
    onSuccess: () => {
      setPasswordTarget(null);
      setNewPassword('');
      toastSuccess('Contraseña actualizada correctamente.');
    },
  });

  const toggleSucursal = (id: number) => {
    setSucursalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-4">
      {users.map((u: any) => (
        <div key={u.id} className="bg-surface border border-surface2 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-heading truncate">{u.name} <span className="text-muted font-mono text-xs">@{u.username}</span></div>
            <div className="text-xs text-secondary mt-0.5">
              {u.role} · {u.role === 'ADMIN' ? 'Todas las sucursales' : (u.sucursales?.map((s: any) => s.sucursal.nombre).join(', ') || 'Sin sucursal asignada')}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setPasswordTarget(u); setNewPassword(''); }}
              title="Cambiar Contraseña"
              className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-secondary hover:text-teal-400 transition"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <span className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${u.active ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
              {u.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      ))}

      {creating ? (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="bg-surface border border-teal-800/50 rounded-2xl p-5 space-y-3"
        >
          <h4 className="text-sm font-bold text-teal-400">Nuevo Usuario</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nombre completo *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Usuario (login) *</label>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Contraseña *</label>
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Rol</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                <option value="VENDEDOR">Vendedor</option>
                <option value="SOLO_CONSULTA">Solo Consulta</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
          </div>

          {role !== 'ADMIN' && (
            <div>
              <label className={labelCls}>Sucursales asignadas *</label>
              <div className="flex flex-wrap gap-2">
                {sucursales.map((s: any) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => toggleSucursal(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      sucursalIds.includes(s.id)
                        ? 'bg-teal-600/20 border-teal-500 text-accent'
                        : 'bg-surface2 border-surface3 text-secondary'
                    }`}
                  >
                    {s.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-secondary hover:text-heading">Cancelar</button>
            <button type="submit" className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-lg">Crear Usuario</button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-surface3 rounded-xl text-secondary hover:text-teal-400 hover:border-teal-600 transition text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Agregar Usuario
        </button>
      )}

      {/* CAMBIAR CONTRASEÑA MODAL */}
      {passwordTarget && (
        <Modal isOpen={Boolean(passwordTarget)} onClose={() => setPasswordTarget(null)} title={`Cambiar Contraseña: ${passwordTarget.name}`} maxWidth="sm">
          <form
            onSubmit={(e) => { e.preventDefault(); changePasswordMutation.mutate(); }}
            className="space-y-4"
          >
            <div>
              <label className={labelCls}>Nueva Contraseña *</label>
              <input
                required
                type="password"
                minLength={8}
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPasswordTarget(null)} className="px-4 py-2 text-sm text-secondary hover:text-heading">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={changePasswordMutation.isPending || newPassword.length < 8}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold rounded-lg disabled:opacity-50"
              >
                Actualizar Contraseña
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
