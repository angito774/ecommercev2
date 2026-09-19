import { and, asc, count, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from 'drizzle-orm';

import { escapeLikePattern } from '@/lib/utils';
import type { InventoryDocumentQueryParams } from '@/modules/inventory/schemas/inventory-document.schema';
import type {
  InventoryDocumentDetail,
  InventoryDocumentItemRow,
  InventoryDocumentRow,
} from '@/modules/inventory/types/inventory-document.types';
import { db, type Reader, type Tx } from '@/server/db';
import { inventoryDocuments, products, stockMovements, transacciones, users } from '@/server/db/schema';

type NewInventoryDocument = typeof inventoryDocuments.$inferInsert;
type NewStockMovement = typeof stockMovements.$inferInsert;

// Proyección positiva. `createdAt` no sale: sería un `Date` bajo un JSON `string`, y el
// documento se identifica por su número y su `docDate` (§6).
const DOCUMENT_COLUMNS = {
  id: inventoryDocuments.id,
  docNumber: inventoryDocuments.docNumber,
  transaccionId: inventoryDocuments.transaccionId,
  transaccionName: transacciones.name,
  direction: transacciones.direction,
  docDate: inventoryDocuments.docDate,
  reference: inventoryDocuments.reference,
  firstName: users.firstName,
  lastName: users.lastName,
  createdByEmail: users.email,
} as const;

type DocumentJoinRow = {
  id: string;
  docNumber: number;
  transaccionId: InventoryDocumentRow['transaccionId'];
  transaccionName: string;
  direction: InventoryDocumentRow['direction'];
  docDate: string;
  reference: string | null;
  firstName: string | null;
  lastName: string | null;
  createdByEmail: string;
};

type DocumentTotals = { itemCount: number; totalQuantity: number };

const NO_TOTALS: DocumentTotals = { itemCount: 0, totalQuantity: 0 };

function toDocumentRow(
  { firstName, lastName, createdByEmail, ...row }: DocumentJoinRow,
  totals: DocumentTotals,
): InventoryDocumentRow {
  return {
    ...row,
    // Cae al correo cuando Clerk no dio nombre: la celda nunca queda en blanco.
    createdByName: [firstName, lastName].filter(Boolean).join(' ') || createdByEmail,
    ...totals,
  };
}

export type InventoryDocumentFilterParams = Pick<
  InventoryDocumentQueryParams,
  'direction' | 'from' | 'to' | 'search'
>;

// Exportada para poder probarla sin base de datos: es la pieza con reglas —el centinela
// `all`, el rango inclusivo y el escape de comodines— y el resto es fontanería de
// Drizzle. Devuelve `undefined` sin filtros: el listado completo es una respuesta
// legítima y no hay ningún invariante que forzar aquí, a diferencia de las alertas de
// stock (spec 016).
export function buildDocumentFilters(params: InventoryDocumentFilterParams): SQL | undefined {
  const conditions: SQL[] = [];

  // `all` no añade la columna: es «sin filtro», no una dirección más. Filtra por
  // `tipotrans` del catálogo unido, que es donde vive el sentido del movimiento (D-5).
  if (params.direction !== 'all') {
    conditions.push(eq(transacciones.direction, params.direction));
  }

  // `gte`/`lte` y no la ventana semiabierta de los pedidos: `doc_date` es una columna
  // `date` sin hora, así que los dos extremos se incluyen tal cual (AC12).
  if (params.from) conditions.push(gte(inventoryDocuments.docDate, params.from));
  if (params.to) conditions.push(lte(inventoryDocuments.docDate, params.to));

  const search = params.search?.trim();
  if (search) {
    // Sin escapar, buscar `%` devolvería la tabla entera como si fuera un resultado
    // (AC13). El valor sigue viajando como parámetro.
    conditions.push(
      ilike(inventoryDocuments.reference, `%${escapeLikePattern(search)}%`),
    );
  }

  return conditions.length === 0 ? undefined : and(...conditions);
}

// `itemCount` y `totalQuantity` salen de una segunda consulta agrupada sobre los ids de
// la página, y no de un `LEFT JOIN … GROUP BY` sobre la consulta principal (D-14): así
// el `count()` del total sigue intacto y la cabecera no multiplica filas. Se agrupa por
// la columna real, sin plantillas `sql` compartidas entre cláusulas, que es la clase de
// bug del spec 015.
//
// `sum(quantity)` cabe en `int4`: el tope son 50 líneas de hasta 1 000 000 unidades.
async function findTotalsByDocument(
  documentIds: string[],
  reader: Reader,
): Promise<Map<string, DocumentTotals>> {
  if (documentIds.length === 0) return new Map();

  const rows = await reader
    .select({
      documentId: stockMovements.documentId,
      itemCount: sql<number>`count(*)::int`,
      totalQuantity: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)::int`,
    })
    .from(stockMovements)
    .where(inArray(stockMovements.documentId, documentIds))
    .groupBy(stockMovements.documentId);

  return new Map(
    rows.map((row) => [
      row.documentId,
      { itemCount: row.itemCount, totalQuantity: row.totalQuantity },
    ]),
  );
}

export type InventoryDocumentListResult = { data: InventoryDocumentRow[]; total: number };

// Orden fijo (`doc_date desc, doc_number desc`) y sin `sortBy`: un libro de documentos se
// lee por fecha, del más reciente al más antiguo, y el correlativo desempata los del
// mismo día dejando la paginación estable (AC12).
export async function findMany(
  params: InventoryDocumentQueryParams,
  reader: Reader = db,
): Promise<InventoryDocumentListResult> {
  const { page, pageSize } = params;
  const where = buildDocumentFilters(params);

  const [rows, [totals]] = await Promise.all([
    reader
      .select(DOCUMENT_COLUMNS)
      .from(inventoryDocuments)
      // `innerJoin` en los dos: `transaccion_id` y `created_by_id` son `notNull` con FK
      // `restrict`, así que la fila del otro lado existe siempre (sin N+1).
      .innerJoin(transacciones, eq(transacciones.id, inventoryDocuments.transaccionId))
      .innerJoin(users, eq(users.id, inventoryDocuments.createdById))
      .where(where)
      .orderBy(desc(inventoryDocuments.docDate), desc(inventoryDocuments.docNumber))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    // El conteo sí necesita el join con el catálogo: el filtro por dirección vive allí.
    reader
      .select({ value: count() })
      .from(inventoryDocuments)
      .innerJoin(transacciones, eq(transacciones.id, inventoryDocuments.transaccionId))
      .where(where),
  ]);

  const totalsByDocument = await findTotalsByDocument(
    rows.map((row) => row.id),
    reader,
  );

  return {
    data: rows.map((row) => toDocumentRow(row, totalsByDocument.get(row.id) ?? NO_TOTALS)),
    total: totals?.value ?? 0,
  };
}

async function findItems(
  documentId: string,
  reader: Reader,
): Promise<InventoryDocumentItemRow[]> {
  return reader
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      productSku: products.sku,
      quantity: stockMovements.quantity,
      stockAfter: stockMovements.stockAfter,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .where(eq(stockMovements.documentId, documentId))
    .orderBy(asc(products.name), asc(stockMovements.id));
}

// Los agregados se derivan de las líneas ya leídas en vez de con una tercera consulta:
// aquí el detalle completo está en memoria y volver a preguntarlo a Postgres sería
// contar lo que ya se tiene.
export async function findById(
  id: string,
  reader: Reader = db,
): Promise<InventoryDocumentDetail | null> {
  const [row] = await reader
    .select(DOCUMENT_COLUMNS)
    .from(inventoryDocuments)
    .innerJoin(transacciones, eq(transacciones.id, inventoryDocuments.transaccionId))
    .innerJoin(users, eq(users.id, inventoryDocuments.createdById))
    .where(eq(inventoryDocuments.id, id))
    .limit(1);

  if (!row) return null;

  const items = await findItems(id, reader);
  const totals: DocumentTotals = {
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
  };

  return { ...toDocumentRow(row, totals), items };
}

// Los dos mutadores exigen `Tx` y no admiten el `db` global: así es imposible registrar
// un documento sin su efecto en stock y sin su entrada en `audit_logs`, porque los tres
// comparten la transacción del service (docs/SETUP.md §5.2, regla dura 2).
//
// El correlativo lo pone la identidad de Postgres y vuelve en el `RETURNING`: no se
// calcula en la aplicación, donde un MAX()+1 dejaría una carrera entre dos altas
// simultáneas (D-6).
export async function insertDocument(
  tx: Tx,
  values: NewInventoryDocument,
): Promise<{ id: string; docNumber: number }> {
  const [inserted] = await tx
    .insert(inventoryDocuments)
    .values(values)
    .returning({ id: inventoryDocuments.id, docNumber: inventoryDocuments.docNumber });

  return inserted;
}

export async function insertMovements(tx: Tx, rows: NewStockMovement[]): Promise<void> {
  // Un INSERT sin valores falla en Drizzle, y Zod ya rechaza el documento sin líneas
  // (AC8): la guarda es para que el repositorio no dependa de ese orden.
  if (rows.length === 0) return;

  await tx.insert(stockMovements).values(rows);
}
