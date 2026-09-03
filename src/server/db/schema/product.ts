import {
  boolean,
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
    stock: integer('stock').notNull().default(0),
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
  ],
);
