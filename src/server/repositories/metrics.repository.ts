import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { REPORTING_TIME_ZONE } from '@/lib/reporting';
import type { PeriodRange, ResolvedPeriodRange } from '@/modules/dashboard/lib/period-range';
import type {
  LowStockRow,
  RevenuePoint,
  TopProductRow,
} from '@/modules/dashboard/types/dashboard.types';
import { db, type Reader } from '@/server/db';
import { orderItems, orders, products } from '@/server/db/schema';

// Solo lo cobrado: `pending`, `payment_failed` y `canceled` no suman ni al importe
// ni al conteo (AC8). El filtro está en las tres lecturas de ventas, nunca en el
// handler, para que ninguna pueda olvidarlo.
//
// `finance.repository.ts` declara esta misma constante: es la única regla que los dos
// comparten y se deja duplicada a propósito (spec 017, D-1), porque acoplar los
// repositorios haría que un cambio en la lógica de comparación del dashboard alterase
// en silencio el estado de resultados. Si cambia el criterio de «venta cobrada», hay
// que tocar los dos.
const PAID = eq(orders.status, 'paid');

// `sum(int4)` ya devuelve `bigint` en Postgres; el casteo explícito deja escrito
// que el desbordamiento del `int4` está considerado y no es un accidente del motor
// (D-11). El driver entrega los bigint como texto, así que el `Number()` de vuelta
// es obligatorio: sin él, dos importes se concatenarían como cadenas.
const toCents = (value: string | null): number => Number(value ?? 0);

export type PeriodTotals = { revenueCents: number; orderCount: number };

export type KpiTotals = {
  current: PeriodTotals;
  previous: PeriodTotals;
};

// Una sola consulta con agregados condicionales sobre `[previousFrom, to)`, no dos
// lecturas: es un único recorrido del mismo índice y, sobre todo, elimina la
// ventana entre ambas —con dos consultas, un pedido que entra en medio podría
// contarse en las dos o en ninguna (D-9).
export async function findKpiTotals(
  { current, previous }: ResolvedPeriodRange,
  reader: Reader = db,
): Promise<KpiTotals> {
  const inCurrent = sql`${orders.createdAt} >= ${current.from}`;
  const inPrevious = sql`${orders.createdAt} < ${current.from}`;

  const [row] = await reader
    .select({
      currentRevenueCents: sql<string>`coalesce(sum(${orders.amountTotalCents}) filter (where ${inCurrent}), 0)::bigint`,
      currentOrderCount: sql<number>`count(*) filter (where ${inCurrent})::int`,
      previousRevenueCents: sql<string>`coalesce(sum(${orders.amountTotalCents}) filter (where ${inPrevious}), 0)::bigint`,
      previousOrderCount: sql<number>`count(*) filter (where ${inPrevious})::int`,
    })
    .from(orders)
    // `gte`/`lt`: el intervalo es semiabierto y `previous.from` es su único extremo
    // cerrado. Con `lte` en `current.to`, un pedido de medianoche exacta caería
    // también en la ventana siguiente.
    .where(and(PAID, gte(orders.createdAt, previous.from), lt(orders.createdAt, current.to)));

  return {
    current: {
      revenueCents: toCents(row?.currentRevenueCents ?? null),
      orderCount: row?.currentOrderCount ?? 0,
    },
    previous: {
      revenueCents: toCents(row?.previousRevenueCents ?? null),
      orderCount: row?.previousOrderCount ?? 0,
    },
  };
}

// El día se resuelve en SQL y viaja como texto: un `date` que cruza el driver
// vuelve a ser un `Date` en UTC y el `toISOString().slice(0, 10)` desplazaría el
// día que acabamos de calcular con tanto cuidado (D-20).
//
// El huso va como parámetro con `::text` explícito: sin el casteo, el literal sin
// tipo deja ambiguo el `timezone(unknown, timestamptz)` que Postgres resuelve por
// sobrecarga.
const REPORTING_DAY = sql<string>`to_char((${orders.createdAt} at time zone ${REPORTING_TIME_ZONE}::text)::date, 'YYYY-MM-DD')`;

// Devuelve solo los días con ventas. El relleno de los huecos es de
// `fillRevenueSeries()`, que lo hace sobre el rango y se prueba sin base (D-19).
export async function findRevenueSeries(
  { from, to }: PeriodRange,
  reader: Reader = db,
): Promise<RevenuePoint[]> {
  const rows = await reader
    .select({
      day: REPORTING_DAY,
      revenueCents: sql<string>`coalesce(sum(${orders.amountTotalCents}), 0)::bigint`,
    })
    .from(orders)
    .where(and(PAID, gte(orders.createdAt, from), lt(orders.createdAt, to)))
    // Por posición (1 = `day`), no por la expresión repetida: Drizzle cualifica
    // `REPORTING_DAY` de forma distinta en `select` ("created_at") que en
    // `groupBy`/`orderBy` ("orders"."created_at"), y Postgres exige coincidencia
    // textual exacta con el `SELECT` — con la expresión repetida, fallaba con
    // 42803 ("column must appear in the GROUP BY clause"). El ordinal es inmune a
    // esa cualificación porque no depende del texto generado.
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows.map((row) => ({ day: row.day, revenueCents: toCents(row.revenueCents) }));
}

// La multiplicación se hace ya en `bigint`: `price_cents_snapshot * quantity` en
// `int4` desborda antes de llegar a la suma con un precio alto y una cantidad
// grande, y el fallo sería un 500 en la mejor venta del año (D-11).
const LINE_REVENUE = sql<string>`coalesce(sum(${orderItems.priceCentsSnapshot}::bigint * ${orderItems.quantity}), 0)::bigint`;

// Agrupa por `product_id` y muestra el nombre actual del catálogo, pero factura con
// el precio congelado de la línea: lo que se pregunta es qué producto vende, y
// agrupar por el nombre del snapshot partiría en dos filas un producto renombrado
// (D-10). El `innerJoin` a `products` es seguro porque `order_items.product_id` es
// `notNull` con FK `restrict`.
export async function findTopProducts(
  { from, to }: PeriodRange,
  limit: number,
  reader: Reader = db,
): Promise<TopProductRow[]> {
  const rows = await reader
    .select({
      productId: orderItems.productId,
      name: products.name,
      unitsSold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
      revenueCents: LINE_REVENUE,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(products, eq(products.id, orderItems.productId))
    .where(and(PAID, gte(orders.createdAt, from), lt(orders.createdAt, to)))
    .groupBy(orderItems.productId, products.name)
    // El nombre desempata: dos productos con el mismo ingreso alternarían de
    // posición entre dos refrescos del polling y la lista parpadearía sola.
    .orderBy(desc(LINE_REVENUE), asc(products.name))
    .limit(limit);

  return rows.map((row) => ({
    productId: row.productId,
    name: row.name,
    unitsSold: row.unitsSold,
    revenueCents: toCents(row.revenueCents),
  }));
}

// Sin parámetro de rango, y no por olvido: el widget refleja el stock de ahora, no
// el histórico, así que cambiar de período no cambia su contenido (AC13). La firma
// es lo que hace imposible colarle un rango.
export async function findLowStockProducts(
  threshold: number,
  limit: number,
  reader: Reader = db,
): Promise<LowStockRow[]> {
  return reader
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      stock: products.stock,
    })
    .from(products)
    // Solo activos: un producto retirado del catálogo no se repone (AC14).
    .where(and(eq(products.isActive, true), lt(products.stock, threshold)))
    // El nombre desempata a los que comparten stock, por el mismo motivo que en el
    // top: sin él, el orden entre iguales lo decide Postgres y puede cambiar.
    .orderBy(asc(products.stock), asc(products.name))
    .limit(limit);
}
