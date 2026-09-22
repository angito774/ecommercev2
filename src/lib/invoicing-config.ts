// `server-only` rompe el build si alguien importa este módulo desde un componente
// cliente. Sin él, un import por descuido metería `NUBEFACT_API_TOKEN` en el bundle del
// navegador y el token de facturación quedaría publicado (spec 022, §10).
import 'server-only';

// Se falla **al importar**, no en la primera emisión, igual que `src/lib/stripe.ts` con
// `STRIPE_SECRET_KEY` (D-18): un despliegue sin configurar debe romper visiblemente en el
// arranque y no acabar en un rechazo de SUNAT o en un 500 durante el primer comprobante
// real de la tienda.
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} no está definida. Copia .env.example a .env.local.`);
  }
  return value;
}

// Las series **no** entran aquí y es deliberado: solo las lee `npm run db:seed` para
// crear las 6 filas de `document_series`, y en runtime la serie vigente sale de la tabla,
// que es la misma fila que lleva el correlativo. Leerlas también aquí crearía una segunda
// fuente de verdad sobre con qué serie se numera (§5.5).
export const invoicingConfig = {
  // Datos fiscales del emisor. Sin panel de configuración: son tres valores que cambian
  // cuando cambia la empresa, es decir, nunca, y un CRUD con permiso y auditoría detrás
  // crearía la posibilidad de emitir cien comprobantes con el RUC mal tecleado (D-18).
  company: {
    ruc: required('INVOICING_COMPANY_RUC'),
    legalName: required('INVOICING_COMPANY_LEGAL_NAME'),
    address: required('INVOICING_COMPANY_ADDRESS'),
  },
  nubefact: {
    apiUrl: required('NUBEFACT_API_URL'),
    apiToken: required('NUBEFACT_API_TOKEN'),
  },
} as const;

// La llamada ocurre dentro de la petición del administrador, así que un proveedor lento
// se traduce en un botón girando. Acotarla es lo que hace que el fallo salga como un 502
// con su mensaje en vez de como una petición colgada (§10). 20 s deja margen a que
// Nubefact envíe el comprobante a SUNAT y espere su CDR, que es la parte lenta.
export const INVOICING_REQUEST_TIMEOUT_MS = 20_000;
