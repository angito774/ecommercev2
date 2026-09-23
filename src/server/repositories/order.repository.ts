import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { escapeLikePattern } from '@/lib/utils';
import { MAX_ORDER_HISTORY } from '@/modules/orders/constants';
import { parseShippingAddress } from '@/modules/orders/lib/shipping-address';
import type {
  AdminOrderDetail,
  AdminOrderRow,
  OrderHistoryEntry,
  OrderLineDisplay,
  OrderSummary,
} from '@/modules/orders/types/order.types';
import type { AdminOrderQueryParams } from '@/modules/orders/schemas/admin-order.schema';
import type { OrderHistoryQueryParams } from '@/modules/orders/schemas/order-history.schema';
import { db, type Reader, type Tx } from '@/server/db';
import { orderItems, orders, products, users } from '@/server/db/schema';

type Order = typeof orders.$inferSelect;
type NewOrder = typeof orders.$inferInsert;
type OrderItem = typeof orderItems.$inferSelect;
type NewOrderItem = typeof orderItems.$inferInsert;

// Los mutadores reciben un `Tx` y no admiten el `db` global: así es imposible
// escribir una orden sin su entrada en `audit_logs` ni sus líneas, porque todo
// comparte la transacción del servicio (docs/SETUP.md §5.2, regla dura 2).
export async function create(tx: Tx, values: NewOrder): Promise<Order> {
  const [created] = await tx.insert(orders).values(values).returning();
  return created;
}

export async function createItems(
  tx: Tx,
  values: NewOrderItem[],
): Promise<OrderItem[]> {
  if (values.length === 0) return [];
  return tx.insert(orderItems).values(values).returning();
}

// Único mutador que no exige `Tx`: el `session_id` solo existe después de que
// Stripe cree la sesión, y eso ocurre con la transacción del INSERT ya commiteada
// (T14). No hay nada que auditar en este UPDATE —la orden sigue `pending` y sin
// efecto de negocio—, así que no rompe la regla dura de docs/SETUP.md §5.2.
export async function attachStripeSession(orderId: string, sessionId: string): Promise<void> {
  await db
    .update(orders)
    .set({ stripeCheckoutSessionId: sessionId })
    .where(eq(orders.id, orderId));
}

// `productId` viaja en la proyección porque el fulfillment lo necesita para
// descontar stock y la confirmación no lo pinta: es un uuid que el catálogo ya
// publica, así que una segunda proyección solo para ocultarlo no compraría nada.
const SUMMARY_ITEM_COLUMNS = {
  id: orderItems.id,
  productId: orderItems.productId,
  nameSnapshot: orderItems.nameSnapshot,
  imageUrlSnapshot: orderItems.imageUrlSnapshot,
  priceCentsSnapshot: orderItems.priceCentsSnapshot,
  quantity: orderItems.quantity,
} as const;

async function loadItems(orderId: string, reader: Reader) {
  return reader
    .select(SUMMARY_ITEM_COLUMNS)
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    // Sin orden explícito, Postgres no garantiza el mismo listado entre dos
    // renders de la misma confirmación.
    .orderBy(asc(orderItems.nameSnapshot));
}

// Misma proyección que `SUMMARY_ITEM_COLUMNS` menos `productId` —que el contrato
// del historial no publica— y más `orderId`, que aquí no es un dato de salida sino
// la clave con la que se reparten las líneas entre sus cabeceras.
const HISTORY_ITEM_COLUMNS = {
  id: orderItems.id,
  orderId: orderItems.orderId,
  nameSnapshot: orderItems.nameSnapshot,
  imageUrlSnapshot: orderItems.imageUrlSnapshot,
  priceCentsSnapshot: orderItems.priceCentsSnapshot,
  quantity: orderItems.quantity,
} as const;

// Una sola consulta para las líneas de toda la página, no un `loadItems` por
// pedido: con el tope de 60 cabeceras, la versión ingenua serían 60 viajes al pool
// serverless (§10). El `leftJoin` con la cabecera es la alternativa, pero repite
// la cabecera por línea y obliga a deduplicarla al leer.
async function loadItemsByOrder(
  orderIds: string[],
  reader: Reader,
): Promise<Map<string, OrderLineDisplay[]>> {
  const byOrder = new Map<string, OrderLineDisplay[]>();
  if (orderIds.length === 0) return byOrder;

  const rows = await reader
    .select(HISTORY_ITEM_COLUMNS)
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    // Mismo criterio que `loadItems`: sin orden explícito, dos renders del mismo
    // pedido pueden listar sus líneas en distinto orden.
    .orderBy(asc(orderItems.nameSnapshot));

  for (const { orderId, ...line } of rows) {
    const bucket = byOrder.get(orderId);
    if (bucket) bucket.push(line);
    else byOrder.set(orderId, [line]);
  }

  return byOrder;
}

// Proyección positiva: se enumera lo que sale, no lo que se oculta. Un `select()`
// sin argumentos publicaría `user_id`, los ids de Stripe y `shipping_address`
// (AC8). `stripePaymentIntentId` entra solo para colapsarse en `receiptAvailable`
// y nunca sale de esta función (D-4).
const HISTORY_ORDER_COLUMNS = {
  id: orders.id,
  status: orders.status,
  subtotalCents: orders.subtotalCents,
  shippingCents: orders.shippingCents,
  amountTotalCents: orders.amountTotalCents,
  createdAt: orders.createdAt,
  stripePaymentIntentId: orders.stripePaymentIntentId,
} as const;

// Sin `documents`: los comprobantes de toda la página se leen de una sola vez desde
// `electronic-document.repository` y el handler los reparte (spec 022, T27). Se declara con
// `Omit` en vez de con un tipo paralelo para que añadir un campo a `OrderHistoryEntry`
// obligue a decidir de qué lado cae, en vez de dejar los dos tipos divergiendo en silencio.
export type OrderHistoryPage = {
  data: Array<Omit<OrderHistoryEntry, 'documents'>>;
  truncated: boolean;
};

// El `WHERE` completo del historial. El filtro por `user_id` va dentro, no
// después de leer: es lo que hace imposible devolver el pedido de otro (AC7).
// `isNotNull(stripeCheckoutSessionId)` descarta los intentos en los que la
// creación de la sesión de Stripe falló y el cliente nunca vio la pantalla de
// pago: mostrárselos sería inventarle un pedido que no hizo (D-14, AC14).
export async function findManyByUser(
  userId: string,
  { from, to }: OrderHistoryQueryParams,
  reader: Reader = db,
): Promise<OrderHistoryPage> {
  const rows = await reader
    .select(HISTORY_ORDER_COLUMNS)
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        isNotNull(orders.stripeCheckoutSessionId),
        from ? gte(orders.createdAt, new Date(from)) : undefined,
        to ? lte(orders.createdAt, new Date(to)) : undefined,
      ),
    )
    // `id` como desempate: dos pedidos con el mismo `created_at` al microsegundo
    // alternarían de posición entre dos consultas idénticas.
    .orderBy(desc(orders.createdAt), desc(orders.id))
    // Una fila de más que el tope: es lo que permite distinguir «caben justos» de
    // «había más y se recortó», sin una segunda consulta de conteo (D-5).
    .limit(MAX_ORDER_HISTORY + 1);

  const truncated = rows.length > MAX_ORDER_HISTORY;
  const page = truncated ? rows.slice(0, MAX_ORDER_HISTORY) : rows;
  const itemsByOrder = await loadItemsByOrder(
    page.map((row) => row.id),
    reader,
  );

  return {
    truncated,
    data: page.map((row) => ({
      id: row.id,
      status: row.status,
      subtotalCents: row.subtotalCents,
      shippingCents: row.shippingCents,
      amountTotalCents: row.amountTotalCents,
      // ISO y no `Date`: JSON no transporta `Date` y el tipo del cliente lo
      // declara `string` para no mentir (D-15).
      createdAt: row.createdAt.toISOString(),
      receiptAvailable: row.status === 'paid' && row.stripePaymentIntentId !== null,
      items: itemsByOrder.get(row.id) ?? [],
    })),
  };
}

// Fila completa, `stripePaymentIntentId` incluido: la consume el servicio de
// boleta en el servidor y nada de esto viaja al cliente. El filtro de propiedad
// va en el `WHERE`, igual que en `findBySessionIdForUser`, así que el pedido
// ajeno ni siquiera se llega a leer (D-13).
export async function findByIdForUser(
  orderId: string,
  userId: string,
  reader: Reader = db,
): Promise<Order | null> {
  const [order] = await reader
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);

  return order ?? null;
}

function toSummary(order: Order, items: OrderSummary['items']): OrderSummary {
  return {
    id: order.id,
    status: order.status,
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    amountTotalCents: order.amountTotalCents,
    createdAt: order.createdAt,
    items,
  };
}

export async function findByIdWithItems(
  id: string,
  reader: Reader = db,
): Promise<OrderSummary | null> {
  const [order] = await reader.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;

  return toSummary(order, await loadItems(order.id, reader));
}

// El filtro por `user_id` es lo que impide leer el pedido ajeno con un `session_id`
// robado o adivinado: sin él, la página de éxito filtraría el detalle de la compra
// de otra persona (D-16, AC11).
export async function findBySessionIdForUser(
  sessionId: string,
  userId: string,
  reader: Reader = db,
): Promise<OrderSummary | null> {
  const [order] = await reader
    .select()
    .from(orders)
    .where(
      and(eq(orders.stripeCheckoutSessionId, sessionId), eq(orders.userId, userId)),
    )
    .limit(1);

  if (!order) return null;

  return toSummary(order, await loadItems(order.id, reader));
}

// ---------------------------------------------------------------------------
// Panel de administración (spec 014). A diferencia de las lecturas de cliente, el
// filtro de propiedad no existe: quien llega hasta aquí ya trae `orders.read`, que
// es un permiso sobre todos los pedidos. Tampoco se descartan los pedidos sin
// `stripe_checkout_session_id`: al administrador le interesan justamente esos, los
// intentos en los que falló la creación de la sesión (D-7).
// ---------------------------------------------------------------------------

// Número de líneas del pedido como subconsulta agregada dentro del mismo SELECT, no
// una consulta por fila: la tabla solo muestra el contador y cargar las líneas de
// las 20 cabeceras serían 20 viajes al pool serverless (§10).
const ADMIN_ITEM_COUNT = sql<number>`(
  select count(*)::int
  from ${orderItems}
  where ${orderItems.orderId} = ${orders.id}
)`;

type AdminOrderFilterParams = Pick<
  AdminOrderQueryParams,
  'dateFrom' | 'dateTo' | 'status' | 'customerSearch'
>;

// Exportada para poder probarla sin base de datos: es la pieza con reglas —el
// `all` que no filtra, el escape de comodines, las cuatro columnas de la búsqueda—
// y el resto de `findManyForAdmin` es fontanería de Drizzle.
export function buildAdminOrderFilters(params: AdminOrderFilterParams): SQL | undefined {
  const conditions: SQL[] = [];

  if (params.status !== 'all') conditions.push(eq(orders.status, params.status));

  // Extremos incluidos (AC5): `gte`/`lte`. Los instantes llegan ya en UTC desde el
  // navegador, igual que en el historial del cliente.
  if (params.dateFrom) conditions.push(gte(orders.createdAt, new Date(params.dateFrom)));
  if (params.dateTo) conditions.push(lte(orders.createdAt, new Date(params.dateTo)));

  const search = params.customerSearch?.trim();
  if (search) {
    // Sin escapar, buscar `%` devolvería la tabla entera como si fuera un resultado
    // (AC9). El valor sigue viajando como parámetro: esto no es inyección, es un
    // resultado incorrecto que quien consulta puede provocar.
    const pattern = `%${escapeLikePattern(search)}%`;

    // `concat_ws` y no `firstName || ' ' || lastName`: la concatenación con `||`
    // devuelve NULL si cualquiera de los dos lados lo es, así que quien solo tiene
    // nombre desaparecería del resultado en vez de casar por él (D-8).
    conditions.push(
      or(
        ilike(users.email, pattern),
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
        ilike(sql`concat_ws(' ', ${users.firstName}, ${users.lastName})`, pattern),
      ) as SQL,
    );
  }

  return conditions.length === 0 ? undefined : and(...conditions);
}

// Nombre para mostrar. `null` y no cadena vacía cuando Clerk no dio ninguno de los
// dos: la UI cae al correo, y `''` la dejaría pintando un hueco.
function toCustomerName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name === '' ? null : name;
}

// Proyección positiva, mismo criterio que `HISTORY_ORDER_COLUMNS`: se enumera lo que
// sale. Lo común a listado y detalle; ni los ids de Stripe ni la dirección entran
// aquí, porque el listado no los publica.
const ADMIN_ORDER_BASE_COLUMNS = {
  id: orders.id,
  status: orders.status,
  subtotalCents: orders.subtotalCents,
  shippingCents: orders.shippingCents,
  amountTotalCents: orders.amountTotalCents,
  currency: orders.currency,
  createdAt: orders.createdAt,
  customerId: users.id,
  customerFirstName: users.firstName,
  customerLastName: users.lastName,
  customerEmail: users.email,
} as const;

const ADMIN_ORDER_COLUMNS = {
  ...ADMIN_ORDER_BASE_COLUMNS,
  itemCount: ADMIN_ITEM_COUNT,
} as const;

export type AdminOrderListResult = { data: AdminOrderRow[]; total: number };

export async function findManyForAdmin(
  params: AdminOrderQueryParams,
  reader: Reader = db,
): Promise<AdminOrderListResult> {
  const { page, pageSize } = params;
  const where = buildAdminOrderFilters(params);

  // `innerJoin` y no `leftJoin`: `orders.user_id` es `notNull` con FK `restrict`, así
  // que un pedido sin comprador no puede existir y el join no oculta ninguna fila.
  const [rows, [totals]] = await Promise.all([
    reader
      .select(ADMIN_ORDER_COLUMNS)
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where)
      // `id` como desempate: dos pedidos con el mismo `created_at` al microsegundo
      // podrían repetirse o saltarse entre dos páginas.
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    // El conteo repite el join porque la búsqueda por cliente filtra sobre `users`:
    // sin él, el total no casaría con las filas de la página.
    reader
      .select({ value: count() })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where),
  ]);

  return {
    total: totals?.value ?? 0,
    data: rows.map((row) => ({
      id: row.id,
      status: row.status,
      subtotalCents: row.subtotalCents,
      shippingCents: row.shippingCents,
      amountTotalCents: row.amountTotalCents,
      currency: row.currency,
      createdAt: row.createdAt.toISOString(),
      customerId: row.customerId,
      customerName: toCustomerName(row.customerFirstName, row.customerLastName),
      customerEmail: row.customerEmail,
      itemCount: row.itemCount,
    })),
  };
}

// Fila desnuda, sin join ni proyección: alimenta el `before` de la bitácora y la
// comprobación de estado previa al UPDATE (D-5). Acepta un `Reader` porque esa
// lectura debe correr dentro de la transacción de la cancelación para ver el mismo
// estado que el UPDATE.
export async function findById(id: string, reader: Reader = db): Promise<Order | null> {
  const [order] = await reader.select().from(orders).where(eq(orders.id, id)).limit(1);
  return order ?? null;
}

// Aquí sí salen los ids de Stripe y la dirección: es el detalle, y sigue bajo
// `orders.read` (D-6). Sin `itemCount`, en cambio: el detalle trae las líneas
// enteras, y contarlas aparte sería pedir dos veces lo mismo.
const ADMIN_ORDER_DETAIL_COLUMNS = {
  ...ADMIN_ORDER_BASE_COLUMNS,
  updatedAt: orders.updatedAt,
  shippingAddress: orders.shippingAddress,
  stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
  stripePaymentIntentId: orders.stripePaymentIntentId,
  // Solo en el detalle y no en el listado (spec 023, AC21): el saldo devolvible se lee
  // junto al total del pedido, y una columna más en la tabla de 20 filas no responde
  // ninguna pregunta que la tabla haga. Los tres campos fiscales del comprador siguen sin
  // salir: son PII y no los publica ninguna API de este módulo.
  refundedAmountCents: orders.refundedAmountCents,
} as const;

// Sin `documents`, por lo mismo que `OrderHistoryPage`: los comprobantes los lee su propio
// repositorio y el handler compone (spec 022, T26). Así `order.repository.ts` no adquiere
// una dependencia del módulo de facturación para una columna que no es suya.
export async function findByIdForAdmin(
  id: string,
  reader: Reader = db,
): Promise<Omit<AdminOrderDetail, 'documents'> | null> {
  const [row] = await reader
    .select(ADMIN_ORDER_DETAIL_COLUMNS)
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, id))
    .limit(1);

  if (!row) return null;

  const items = await loadItems(row.id, reader);

  return {
    id: row.id,
    status: row.status,
    subtotalCents: row.subtotalCents,
    shippingCents: row.shippingCents,
    amountTotalCents: row.amountTotalCents,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    customerId: row.customerId,
    customerName: toCustomerName(row.customerFirstName, row.customerLastName),
    customerEmail: row.customerEmail,
    // Se enumera lo que sale, igual que en las proyecciones de arriba: `loadItems`
    // trae `productId` porque el fulfillment lo necesita, y el contrato del detalle
    // publica `OrderLineDisplay`. Mandar un campo que el tipo no declara deja al
    // cliente dependiendo de algo que nadie acordó.
    items: items.map((line) => ({
      id: line.id,
      nameSnapshot: line.nameSnapshot,
      imageUrlSnapshot: line.imageUrlSnapshot,
      priceCentsSnapshot: line.priceCentsSnapshot,
      quantity: line.quantity,
    })),
    shippingAddress: parseShippingAddress(row.shippingAddress),
    stripeCheckoutSessionId: row.stripeCheckoutSessionId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    refundedAmountCents: row.refundedAmountCents,
  };
}

// ---------------------------------------------------------------------------
// Facturación electrónica (spec 022)
// ---------------------------------------------------------------------------

// Todo lo que hace falta para construir el comprobante y **nada más**: los datos fiscales
// del comprador, los importes del pedido y el nombre con el que identificarlo. Proyección
// propia y no una de las de admin, por la razón contraria a la habitual: aquí sí salen
// `buyer_document_number` y `buyer_legal_name`, que son PII y **no se publican por ninguna
// API** (AC22). Lo consume un solo llamador —`electronic-document.service.ts`— y su único
// destino legítimo es el cuerpo que se envía a Nubefact (§10).
const ORDER_FISCAL_COLUMNS = {
  id: orders.id,
  status: orders.status,
  amountTotalCents: orders.amountTotalCents,
  shippingCents: orders.shippingCents,
  buyerDocumentType: orders.buyerDocumentType,
  buyerDocumentNumber: orders.buyerDocumentNumber,
  buyerLegalName: orders.buyerLegalName,
  customerFirstName: users.firstName,
  customerLastName: users.lastName,
  customerEmail: users.email,
} as const;

export type OrderFiscalSnapshot = {
  id: string;
  status: Order['status'];
  amountTotalCents: number;
  shippingCents: number;
  buyerDocumentType: Order['buyerDocumentType'];
  buyerDocumentNumber: string | null;
  buyerLegalName: string | null;
  /** `firstName` + `lastName` de Clerk; `null` si no dio ninguno. */
  customerName: string | null;
  customerEmail: string;
  items: OrderLineDisplay[];
};

export async function findFiscalSnapshot(
  orderId: string,
  reader: Reader = db,
): Promise<OrderFiscalSnapshot | null> {
  const [row] = await reader
    .select(ORDER_FISCAL_COLUMNS)
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) return null;

  const items = await loadItems(row.id, reader);

  return {
    id: row.id,
    status: row.status,
    amountTotalCents: row.amountTotalCents,
    shippingCents: row.shippingCents,
    buyerDocumentType: row.buyerDocumentType,
    buyerDocumentNumber: row.buyerDocumentNumber,
    buyerLegalName: row.buyerLegalName,
    customerName: toCustomerName(row.customerFirstName, row.customerLastName),
    customerEmail: row.customerEmail,
    items: items.map((line) => ({
      id: line.id,
      nameSnapshot: line.nameSnapshot,
      imageUrlSnapshot: line.imageUrlSnapshot,
      priceCentsSnapshot: line.priceCentsSnapshot,
      quantity: line.quantity,
    })),
  };
}

// UPDATE condicional, no read-then-write: dos entregas concurrentes del mismo
// evento podrían pasar una comprobación en memoria las dos veces. Aquí la carrera
// la resuelve el motor — la segunda no encuentra ninguna fila `pending` y devuelve
// `null`, así que el servicio se sale sin tocar stock ni bitácora (D-5, AC6).
//
// El `WHERE ... status = 'pending'` vive en un solo sitio a propósito: es la
// invariante de idempotencia de las tres transiciones, y copiada tres veces bastaba
// con olvidarla en una para conceder un pedido dos veces.
type PendingTransition = Pick<NewOrder, 'stripePaymentIntentId' | 'shippingAddress'> & {
  // Sin `pending`: el estado de partida no es un destino válido.
  status: Exclude<Order['status'], 'pending'>;
};

async function transitionFromPending(
  tx: Tx,
  orderId: string,
  values: PendingTransition,
): Promise<Order | null> {
  const [updated] = await tx
    .update(orders)
    .set(values)
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
    .returning();

  return updated ?? null;
}

export async function markPaid(
  tx: Tx,
  orderId: string,
  values: { paymentIntentId: string | null; shippingAddress: Record<string, unknown> | null },
): Promise<Order | null> {
  return transitionFromPending(tx, orderId, {
    status: 'paid',
    stripePaymentIntentId: values.paymentIntentId,
    shippingAddress: values.shippingAddress,
  });
}

export async function markPaymentFailed(tx: Tx, orderId: string): Promise<Order | null> {
  return transitionFromPending(tx, orderId, { status: 'payment_failed' });
}

// Solo cancela lo que sigue `pending`: una sesión expira también después de un pago
// asíncrono ya cobrado, y ese pedido no debe volver atrás.
export async function markCanceled(tx: Tx, orderId: string): Promise<Order | null> {
  return transitionFromPending(tx, orderId, { status: 'canceled' });
}

/**
 * Congela el costo promedio vigente en las líneas del pedido (spec 027, §5.2). Solo `Tx`:
 * corre dentro de la transacción del webhook o no corre, así que o se guarda con el
 * `paid` o no se guarda nada.
 *
 * Un `UPDATE … FROM products` de **una sola sentencia** y no una escritura por línea
 * (D-2): no relee el catálogo, no amplía el `RETURNING` de `decrementStock()` —que ya
 * hace un UPDATE por línea— y no depende del array de líneas que el servicio ya cargó.
 *
 * **Sin `coalesce`.** Si `average_cost_cents` es `null`, la columna queda `null`: un costo
 * `0` no es «no sé cuánto costó», es «me costó gratis», e inflaría la utilidad bruta justo
 * en los productos peor registrados (D-3).
 */
export async function snapshotItemCosts(tx: Tx, orderId: string): Promise<void> {
  await tx
    .update(orderItems)
    .set({ costCentsSnapshot: sql`${products.averageCostCents}` })
    .from(products)
    .where(and(eq(products.id, orderItems.productId), eq(orderItems.orderId, orderId)));
}

// ---------------------------------------------------------------------------
// Ajuste del pedido (spec 023)
// ---------------------------------------------------------------------------

/**
 * Fila completa **bajo lock**, que es la `tx A` de §6.4: toma el `FOR UPDATE`, se valida el
 * estado y se suelta antes de hablar con Stripe (spec 022, D-9). Sin `SKIP LOCKED`, por lo
 * mismo que el reclamo de un comprobante: no se recorre ninguna cola, así que que el
 * segundo administrador espere —y encuentre el pedido ya ajustado— es el comportamiento
 * correcto y no una contención que evitar.
 *
 * El lock por sí solo **no** basta para la carrera: entre la `tx A` y la `tx B` el estado
 * puede moverse, y quien lo detecta es el `UPDATE` condicional de `applyRefund` (D-5).
 */
export async function findByIdForUpdate(tx: Tx, id: string): Promise<Order | null> {
  const [order] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .for('update')
    .limit(1);

  return order ?? null;
}

// El incremento como expresión sobre la propia columna y no como literal calculado en
// TypeScript (mismo criterio que `buildNextNumberExpression`, spec 022 D-5): leer, sumar en
// TypeScript y volver a escribir dejaría que dos ajustes concurrentes pasaran la
// comprobación las dos veces y devolvieran el doble.
//
// Exportada para compilarla con `PgDialect` en el test: es la pieza con la regla, y el
// resto de `applyRefund` es fontanería de Drizzle.
export function buildRefundIncrement(refundCents: number): SQL {
  return sql`${orders.refundedAmountCents} + ${refundCents}`;
}

/**
 * El `WHERE` que resuelve la carrera **en el motor**: `refunded_amount_cents` tiene que
 * seguir valiendo lo que valía cuando la `tx A` lo leyó. Cero filas significa «alguien se
 * adelantó» y sale por 409 sin haber duplicado el reembolso, porque la clave de
 * idempotencia ya garantizó que Stripe creó un solo refund (D-4, D-5, AC9).
 */
export function buildRefundGuard(orderId: string, refundedBefore: number): SQL {
  return and(
    eq(orders.id, orderId),
    eq(orders.refundedAmountCents, refundedBefore),
  ) as SQL;
}

export type ApplyRefundValues = {
  /** El valor que la `tx A` leyó. Si ya no es ese, otro ajuste ganó la carrera. */
  refundedBefore: number;
  /** Puede ser `0`: un ajuste sin dinero también exige que el estado no se haya movido. */
  refundCents: number;
};

/**
 * `UPDATE orders SET refunded = refunded + $x WHERE id = $1 AND refunded = $refundedBefore`.
 * `null` = 0 filas = conflicto.
 *
 * Se ejecuta **también con `refundCents = 0`** —corrección de comprador y cargo adicional—
 * y no se salta con un `if`: la suma es un no-op, pero el `WHERE` sigue siendo la única
 * comprobación de que el pedido no se movió entre las dos transacciones, y saltárselo
 * dejaría esos dos ajustes sin defensa contra la concurrencia.
 */
export async function applyRefund(
  tx: Tx,
  orderId: string,
  values: ApplyRefundValues,
): Promise<Order | null> {
  const [updated] = await tx
    .update(orders)
    .set({ refundedAmountCents: buildRefundIncrement(values.refundCents) })
    .where(buildRefundGuard(orderId, values.refundedBefore))
    .returning();

  return updated ?? null;
}

/**
 * Los tres campos fiscales del comprador, y solo esos: ni el importe, ni las líneas, ni la
 * dirección (§3). Se escriben juntos porque el `CHECK orders_buyer_document_pair` exige que
 * viajen juntos, y `legalName` llega ya normalizado a `null` —nunca `''`, que es lo que el
 * `CHECK orders_buyer_legal_name_requires_ruc` no admite en una boleta—.
 */
export type BuyerFiscalValues = Pick<
  NewOrder,
  'buyerDocumentType' | 'buyerDocumentNumber' | 'buyerLegalName'
>;

export async function updateBuyer(
  tx: Tx,
  orderId: string,
  values: BuyerFiscalValues,
): Promise<Order | null> {
  const [updated] = await tx
    .update(orders)
    .set(values)
    .where(eq(orders.id, orderId))
    .returning();

  return updated ?? null;
}
