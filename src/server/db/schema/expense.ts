import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { PURCHASE_RECEIPT_TYPES } from '@/lib/purchase-receipts';

import { users } from './user';

// Enum de Postgres y no tabla de categorías (spec 017, D-4): una lista que cambia
// una vez al año no justifica su propio CRUD, sus permisos y su seed. A cambio da un
// `Record<ExpenseCategory, string>` exhaustivo en TypeScript y un desglose type-safe.
// Coste aceptado: añadir un valor exige `ALTER TYPE … ADD VALUE`.
//
// Sin valor de nómina: los salarios son el spec 018 y no se les reserva sitio aquí.
export const expenseCategory = pgEnum('expense_category', [
  'suppliers',
  'logistics',
  'rent',
  'utilities',
  'marketing',
  'software',
  'taxes',
  'other',
]);

// Los valores salen del catálogo puro y no de una tupla repetida aquí (spec 024, D-3).
// Es el patrón de `electronic-documents.ts` y corrige de paso el riesgo que el propio
// spec 017 anotó sobre `EXPENSE_CATEGORIES`: dos listas que deben decir lo mismo.
export const purchaseReceiptType = pgEnum('purchase_receipt_type', PURCHASE_RECEIPT_TYPES);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    concept: varchar('concept', { length: 160 }).notNull(),
    // Céntimos, como `products.price_cents` y `orders.amount_total_cents`.
    amountCents: integer('amount_cents').notNull(),
    category: expenseCategory('category').notNull(),
    // `date` y no `timestamptz`: un gasto ocurre un día, no en un instante, y la
    // columna sin hora no puede desplazarse de día al cruzar el huso (D-5).
    // `mode: 'string'` entrega 'YYYY-MM-DD' y evita el Date→UTC del driver.
    incurredOn: date('incurred_on', { mode: 'string' }).notNull(),
    // `restrict`: las personas se desactivan, no se borran. Un gasto no puede
    // quedar sin responsable, igual que `orders.user_id`.
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    // ── Comprobante de compra (spec 024) ───────────────────────────────────
    // `null` = gasto sin comprobante formal, que es el caso de todo lo registrado
    // hasta este spec. Discrimina las cinco columnas siguientes.
    receiptType: purchaseReceiptType('receipt_type'),
    supplierRuc: varchar('supplier_ruc', { length: 11 }),
    supplierName: varchar('supplier_name', { length: 160 }),
    receiptSeries: varchar('receipt_series', { length: 4 }),
    // Cadena y no entero: el correlativo se imprime con ceros a la izquierda y
    // `00001234` no es `1234` cuando hay que cotejarlo con el papel (D-14).
    receiptNumber: varchar('receipt_number', { length: 20 }),
    // Lo escribe el servidor con `splitIgv()`; ningún schema de entrada lo acepta
    // (AC7). `null` y no `0`: cero significaría «un IGV de cero», que es otra cosa.
    igvCents: integer('igv_cents'),
  },
  (t) => [
    // Sostiene tanto el filtro por rango del resumen como el orden del listado. Sin
    // índice por `category` ni por `created_by_id`: el volumen de un registro manual
    // no lo justifica y sería optimizar sin medida (§10).
    index('expenses_incurred_on_idx').on(t.incurredOn.desc()),
    // El invariante en la base y no solo en Zod: un gasto negativo invertiría el
    // signo del resultado y ningún camino de escritura —seed, migración de datos o
    // un `psql` a mano— debe poder crearlo (D-6).
    check('expenses_amount_cents_positive', sql`${t.amountCents} > 0`),

    // ── Comprobante de compra (spec 024, §5.2) ─────────────────────────────
    // El comprobante es todo o nada: no existe un RUC sin tipo ni un tipo sin RUC.
    // En Zod y además aquí, por lo mismo que el CHECK de importe (017, D-6): un seed
    // o un `psql` a mano no pasan por Zod.
    check(
      'expenses_receipt_all_or_nothing',
      sql`(${t.receiptType} is null) = (${t.supplierRuc} is null)
          and (${t.receiptType} is null) = (${t.supplierName} is null)`,
    ),
    // Forma del RUC, no su dígito verificador: el módulo 11 no cabe en un CHECK sin
    // crear una función en la base, y esa comprobación ya vive en `isValidRuc()`.
    // Un `CHECK` se satisface cuando la expresión es `NULL`, así que `columna ~ patrón`
    // ya deja pasar el `null` sin un `is null or` delante. Es deliberado.
    check('expenses_supplier_ruc_format', sql`${t.supplierRuc} ~ '^[0-9]{11}$'`),
    // Serie y número viajan juntos, y solo con comprobante.
    check(
      'expenses_receipt_series_number_pair',
      sql`(${t.receiptSeries} is null) = (${t.receiptNumber} is null)
          and (${t.receiptType} is not null or ${t.receiptSeries} is null)`,
    ),
    // No hay IGV sin comprobante, y el IGV contenido en un importe nunca llega a ser el
    // importe: con el 18 % incluido son ~15,25 % del total. Un `igv_cents` igual o mayor
    // que `amount_cents` es un dato corrupto, y el sub-proyecto #4 lo restaría del IGV
    // de ventas sin saberlo.
    check(
      'expenses_igv_within_amount',
      sql`${t.igvCents} is null
          or (${t.receiptType} is not null
              and ${t.igvCents} >= 0
              and ${t.igvCents} < ${t.amountCents})`,
    ),
  ],
);
