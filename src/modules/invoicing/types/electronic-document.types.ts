import type { InferSelectModel } from 'drizzle-orm';

// `import type` obligatorio: un import de valor arrastraría el schema Drizzle y
// @neondatabase/serverless al bundle del cliente.
import type { electronicDocuments } from '@/server/db/schema/electronic-document';

export type { ElectronicDocumentKind, ElectronicDocumentStatus } from '@/lib/electronic-documents';

export type ElectronicDocument = InferSelectModel<typeof electronicDocuments>;

/**
 * Lo que sale por la API, para cliente y para admin **con la misma forma**: no hay ningún
 * campo del documento que el administrador pueda ver y el comprador no —es su propio
 * comprobante— así que dos proyecciones solo crearían dos sitios donde olvidarse de
 * excluir `provider_response` (D-12, AC22).
 *
 * `base_cents`, `igv_cents`, `xml_url`, `cdr_url`, `provider_response` y
 * `stripe_refund_id` **no salen por ninguna API de este spec**: el desglose de IGV es dato
 * del módulo de Impuestos (#4) y se publicará con `finance.read`, no con `orders.read`. Es
 * el mismo criterio que mantiene `averageCostCents` fuera de `ProductWithCategory`
 * (spec 021, D-8).
 */
export type ElectronicDocumentRow = Pick<
  ElectronicDocument,
  'id' | 'kind' | 'status' | 'series' | 'number' | 'amountCents' | 'pdfUrl' | 'attemptCount'
> & {
  /** ISO; `null` mientras no esté emitido. JSON no transporta `Date`. */
  issuedAt: string | null;
  /** Texto del último fallo. `null` salvo en `failed`. */
  lastError: string | null;
  /**
   * `true` cuando el rechazo lo produjo una validación del proveedor y no la red: la UI
   * tiene que poder decir «volver a pulsar no lo arregla» en vez de invitar a un bucle
   * inútil (AC12). Se **deriva** de `provider_response.errors`, no se guarda en una
   * columna: es una lectura de un dato que ya está, no un estado nuevo.
   */
  permanentFailure: boolean;
  /** `B001-00000123`. Derivado en servidor para que la UI no reimplemente el formato. */
  label: string | null;
};
