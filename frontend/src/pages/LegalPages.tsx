import React from 'react';
import { LegalLayout, Section, useLegalInfo } from '../components/LegalLayout';
import { DATA_PROVIDERS } from '../legal/providers';

// IMPORTANTE: los textos de esta página son un modelo base redactado para este sistema
// (Ley 25.326 de Protección de Datos Personales). Antes de publicarlos conviene que los
// revise un profesional (abogado/a o contador/a) y ajustar lo que corresponda al negocio.
const LAST_UPDATE = '16 de noviembre de 2026';

const Contact: React.FC = () => {
  const { data } = useLegalInfo();
  if (!data) return <span className="text-muted">(cargando datos de contacto…)</span>;
  return (
    <address className="not-italic bg-surface border border-surface2 rounded-xl p-4 text-sm space-y-0.5">
      <div className="font-semibold text-heading">{data.businessName}</div>
      {data.cuit && <div>CUIT: {data.cuit}</div>}
      {data.address && <div>Domicilio: {data.address}</div>}
      {data.phone && <div>Teléfono: {data.phone}</div>}
      {data.email && (
        <div>
          Email: <a className="text-accent underline" href={`mailto:${data.email}`}>{data.email}</a>
        </div>
      )}
    </address>
  );
};

const List: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);

export const PrivacyPage: React.FC = () => {
  const { data } = useLegalInfo();
  const name = data?.businessName || 'la empresa';
  return (
    <LegalLayout title="Política de Privacidad" updated={LAST_UPDATE}>
      <p>
        Esta política explica qué datos personales trata {name} a través de este sistema de gestión, para qué los usa,
        con quién los comparte y cómo podés ejercer tus derechos, conforme a la Ley 25.326 de Protección de los Datos Personales de la República Argentina.
      </p>

      <Section title="1. Responsable del tratamiento">
        <Contact />
      </Section>

      <Section title="2. Qué datos tratamos">
        <List items={[
          <><strong>Usuarios del sistema (personal):</strong> nombre, nombre de usuario, contraseña (guardada cifrada, nunca en texto legible), rol, sucursales asignadas y registro de las operaciones que realizan (ventas, caja, stock).</>,
          <><strong>Clientes:</strong> nombre o razón social, CUIT/DNI, condición frente al IVA, teléfono, email, dirección, lista de precios, límite y saldo de cuenta corriente, e historial de compras y presupuestos.</>,
          <><strong>Proveedores:</strong> razón social, CUIT, contacto, teléfono, email, dirección y datos bancarios comerciales.</>,
        ]} />
        <p>
          Solicitamos únicamente los datos necesarios: para registrar un cliente el único dato obligatorio es el nombre o razón social; el resto es opcional,
          aunque hay datos (como el CUIT/DNI) que la normativa exige para emitir ciertas facturas.
        </p>
      </Section>

      <Section title="3. Para qué los usamos">
        <List items={[
          'Gestionar ventas, cobros, cuentas corrientes, compras, stock y caja.',
          'Emitir comprobantes y facturas electrónicas ante ARCA (ex AFIP).',
          'Cumplir obligaciones fiscales, contables y legales.',
          'Garantizar la seguridad del sistema y la trazabilidad de las operaciones.',
        ]} />
        <p>No usamos los datos para publicidad ni los vendemos o cedemos a terceros con fines comerciales.</p>
      </Section>

      <Section title="4. Con quién los compartimos">
        <p>
          Solo con los proveedores técnicos y organismos indispensables para que el sistema funcione. La lista completa, con su función y país, está en{' '}
          <a className="text-accent underline" href="/proveedores">Proveedores que procesan datos</a>.
        </p>
      </Section>

      <Section title="5. Transferencias internacionales">
        <p>
          El sistema se aloja en servicios de nube cuyos servidores pueden estar fuera de la Argentina (según la región contratada, ver la lista de proveedores).
          Esas transferencias se realizan a proveedores que ofrecen garantías de seguridad contractuales, conforme al artículo 12 de la Ley 25.326.
          Si sos titular de datos en la Unión Europea, el tratamiento se apoya en esas mismas garantías.
        </p>
      </Section>

      <Section title="6. Cuánto tiempo los conservamos">
        <p>
          Conservamos los datos mientras dure la relación comercial y, luego, durante los plazos que exige la normativa fiscal y contable (en general, 10 años para comprobantes y registros).
          Cuando una persona pide la supresión de sus datos y no hay obligación legal de conservarlos de forma identificable, los eliminamos o los anonimizamos;
          los registros de operaciones se mantienen sin los datos que identifican a la persona.
        </p>
      </Section>

      <Section id="derechos" title="7. Tus derechos">
        <p>Como titular de los datos podés:</p>
        <List items={[
          <><strong>Acceso:</strong> pedir una copia de tus datos. Respondemos dentro de los 10 días corridos de recibido el pedido.</>,
          <><strong>Rectificación y actualización:</strong> corregir datos inexactos o desactualizados.</>,
          <><strong>Supresión:</strong> pedir que eliminemos tus datos personales cuando no exista una obligación legal de conservarlos. Rectificación y supresión se resuelven dentro de los 5 días hábiles.</>,
          <><strong>Oposición</strong> al tratamiento en los casos que la ley prevé.</>,
        ]} />
        <p>
          Para ejercerlos, escribinos al email de contacto indicado arriba, indicando tu nombre y CUIT/DNI para poder identificarte.
          El ejercicio de los derechos de acceso es gratuito en intervalos no inferiores a seis meses, salvo que acredites un interés legítimo.
        </p>
      </Section>

      <Section id="reclamos" title="8. Reclamos">
        <p>
          Podés enviar tus consultas o reclamos de privacidad al contacto indicado en el punto 1. Además, la Agencia de Acceso a la Información Pública,
          en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación
          al incumplimiento de las normas sobre protección de datos personales.
        </p>
      </Section>

      <Section title="9. Seguridad">
        <List items={[
          'Contraseñas almacenadas con hash (bcrypt); nunca en texto legible.',
          'Conexión cifrada (HTTPS) y cabeceras de seguridad, incluida una política de contenido (CSP) estricta.',
          'Acceso por roles y aislamiento por sucursal: cada persona ve solo lo que su rol y sucursal permiten.',
          'Límite de intentos de inicio de sesión y de solicitudes para frenar ataques de fuerza bruta.',
          'Copias de seguridad periódicas de la base de datos.',
        ]} />
      </Section>

      <Section title="10. Cookies y almacenamiento en tu navegador">
        <p>
          Este sistema <strong>no usa cookies de seguimiento, publicidad ni herramientas de analítica</strong>, y no carga recursos de terceros (tipografías, scripts ni
          códigos QR externos). Solo guarda en el almacenamiento local de tu navegador lo estrictamente necesario para funcionar: tu sesión
          iniciada y la preferencia de tema claro/oscuro. Por eso no se muestra un aviso de cookies. Si en el futuro se incorporara analítica,
          se pedirá tu consentimiento previo y podrás rechazarla con la misma facilidad con la que aceptarla.
        </p>
      </Section>

      <Section title="11. Menores de edad">
        <p>
          El sistema es una herramienta de uso comercial destinada a personas mayores de 18 años. No recolectamos intencionalmente datos de menores;
          si detectamos que se cargaron, los eliminamos.
        </p>
      </Section>

      <Section title="12. Cambios en esta política">
        <p>Podemos actualizar esta política. La fecha de la última revisión figura al comienzo de esta página.</p>
      </Section>
    </LegalLayout>
  );
};

export const TermsPage: React.FC = () => {
  const { data } = useLegalInfo();
  const name = data?.businessName || 'la empresa';
  return (
    <LegalLayout title="Términos y Condiciones de Uso" updated={LAST_UPDATE}>
      <p>
        Estos términos regulan el uso del sistema de gestión comercial provisto por {name}. Al iniciar sesión aceptás estas condiciones.
      </p>

      <Section title="1. Uso del sistema">
        <p>
          El sistema es de uso comercial e interno: está destinado a las personas autorizadas por la empresa, mayores de 18 años. Las cuentas son personales
          e intransferibles y se asignan según un rol (administrador, vendedor o solo consulta) y una o más sucursales.
        </p>
      </Section>

      <Section title="2. Credenciales y responsabilidad">
        <List items={[
          'Cada persona es responsable de mantener en reserva su contraseña y de las operaciones realizadas con su usuario.',
          'Ante cualquier uso no autorizado, debe avisarse de inmediato a un administrador para desactivar o cambiar la cuenta.',
          'Está prohibido intentar acceder a información de otras sucursales o roles sin autorización, o vulnerar las medidas de seguridad.',
        ]} />
      </Section>

      <Section title="3. Datos cargados y facturación">
        <List items={[
          'La empresa es titular de los datos que carga y responsable de su exactitud y de contar con la base legal para tratarlos (ver Política de Privacidad).',
          'La emisión de facturas electrónicas se realiza con las credenciales y certificados de la empresa ante ARCA; la responsabilidad fiscal por los comprobantes emitidos es de su titular.',
          'Las facturas emitidas no pueden modificarse; las correcciones se hacen mediante notas de crédito/débito según la normativa.',
        ]} />
      </Section>

      <Section title="4. Disponibilidad y copias de seguridad">
        <p>
          Procuramos que el sistema esté disponible de forma continua, pero pueden existir interrupciones por mantenimiento o causas ajenas (por ejemplo, fallas de los
          proveedores de nube o de ARCA). Se recomienda mantener copias de seguridad periódicas y verificar su restauración.
        </p>
      </Section>

      <Section title="5. Pagos y reembolsos">
        <p>
          Este sistema no cobra suscripciones ni realiza cargos dentro de la aplicación. Las condiciones comerciales y de reembolso del servicio,
          si las hubiera, se establecen en el acuerdo particular entre las partes. Las devoluciones y anulaciones de ventas a clientes finales se
          registran en el sistema según la política comercial de la empresa y la normativa de defensa del consumidor.
        </p>
      </Section>

      <Section title="6. Limitación de responsabilidad">
        <p>
          El sistema se ofrece «tal cual». En la medida permitida por la ley, no respondemos por pérdidas indirectas derivadas de datos mal cargados,
          uso indebido de credenciales o indisponibilidad de servicios de terceros.
        </p>
      </Section>

      <Section title="7. Contacto y ley aplicable">
        <Contact />
        <p>Estos términos se rigen por las leyes de la República Argentina. Ante cualquier controversia, serán competentes los tribunales ordinarios del domicilio de la empresa.</p>
      </Section>
    </LegalLayout>
  );
};

export const ProvidersPage: React.FC = () => (
  <LegalLayout title="Proveedores que procesan datos" updated={LAST_UPDATE}>
    <p>
      Estas son las empresas y organismos que intervienen en el tratamiento de los datos del sistema, con su función y el país donde operan.
      Más información en la <a className="text-accent underline" href="/privacidad">Política de Privacidad</a>.
    </p>

    <div className="overflow-x-auto border border-surface2 rounded-xl">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Proveedores que procesan datos, su función y país</caption>
        <thead className="bg-surface2 text-secondary text-xs uppercase">
          <tr>
            <th scope="col" className="p-3">Proveedor</th>
            <th scope="col" className="p-3">Función</th>
            <th scope="col" className="p-3">Datos que procesa</th>
            <th scope="col" className="p-3">País / región</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface2 bg-surface">
          {DATA_PROVIDERS.map((p) => (
            <tr key={p.name} className="align-top">
              <th scope="row" className="p-3 font-semibold text-heading">{p.name}</th>
              <td className="p-3">{p.role}</td>
              <td className="p-3">{p.data}</td>
              <td className="p-3">{p.country}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <p className="text-secondary">
      No usamos servicios de analítica ni de publicidad. Las tipografías se incluyen en la propia aplicación y los códigos QR de las facturas se generan en
      nuestro servidor, sin enviarlos a terceros. La única excepción posible es el logo de la empresa si se configura con un enlace a un sitio externo.
    </p>
  </LegalLayout>
);
