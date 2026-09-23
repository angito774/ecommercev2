import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { categories } from './category';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: varchar('sku', { length: 60 }).notNull().unique(),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 180 }).notNull().unique(),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 500 }),
    // Céntimos, nunca decimal (CLAUDE.md §6). El punto decimal solo existe en el
    // `<input>` del formulario y en el formateo de la celda; entre medias es un
    // entero. `0.1 + 0.2 !== 0.3` y un catálogo acumula ese error.
    priceCents: integer('price_cents').notNull(),
    // Precio anterior (PVP) en céntimos. Sin default y nullable a propósito: la
    // ausencia es significativa, `NULL` significa "sin descuento" y es lo que
    // apaga el precio tachado, el badge −N % y la sección de ofertas (spec 004, D-8).
    compareAtPriceCents: integer('compare_at_price_cents'),
    stock: integer('stock').notNull().default(0),
    // Costo promedio ponderado vigente, en céntimos. **Nullable a propósito**: `null`
    // significa «sin costo registrado» y es lo que apaga el margen en la pantalla de
    // precio unitario (spec 021, AC5). Un `0` diría «me costó gratis», que es una
    // afirmación distinta y falsa. Solo lo escriben dos caminos: el recálculo de una
    // nota de `ingreso_compra` y la carga del costo inicial, que exige que esté en
    // `null` (D-4).
    averageCostCents: integer('average_cost_cents'),
    // Ficha técnica como pares clave/valor. Una tabla aparte no aporta nada
    // mientras nadie consulte *por* especificación, y `jsonb` evita una migración
    // futura si eso cambia (spec 003 §8).
    specs: jsonb('specs').$type<Record<string, string>>(),
    // `restrict` es documentación tanto como restricción: las categorías se
    // desactivan, no se borran, así que hoy nada dispara esta cláusula. Deja
    // escrito que un borrado físico no debe poder dejar productos huérfanos.
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('products_category_id_idx').on(t.categoryId),
    index('products_is_active_idx').on(t.isActive),
    index('products_created_at_idx').on(t.createdAt.desc()),
    // Tercer `CHECK` del esquema, mismo criterio que `expenses_amount_cents_positive` y
    // `stock_movements_quantity_positive`: el promedio de valores positivos nunca cae por
    // debajo del menor de ellos, así que un `0` o un negativo aquí solo puede venir de un
    // `psql` a mano o de una migración de datos, y ninguno de los dos pasa por Zod.
    check(
      'products_average_cost_cents_positive',
      sql`${t.averageCostCents} is null or ${t.averageCostCents} > 0`,
    ),
  ],
);
