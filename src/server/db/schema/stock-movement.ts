import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { inventoryDocuments } from './inventory-document';
import { products } from './product';

// El libro mayor de movimientos que anunció el spec 016 §11: cada línea es qué
// producto, cuántas unidades y con qué stock quedó. Append-only, como su cabecera.
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict` y no `cascade` como en `order_items` (spec 020, D-10): la propiedad
    // que hay que dejar escrita aquí es que un documento con movimientos **no se
    // puede borrar**, en vez de confiarlo a que nadie escriba el DELETE.
    documentId: uuid('document_id')
      .notNull()
      .references(() => inventoryDocuments.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    // Siempre positiva. El signo lo pone la dirección del documento (D-5): un `-5` en
    // la tabla obligaría a recordar quién puso el signo al escribir y al leer.
    quantity: integer('quantity').notNull(),
    // Stock con el que quedó el producto tras aplicar esta línea, tal y como lo
    // devolvió el RETURNING del UPDATE (D-11). Ya venía gratis, y hace visible en la
    // propia línea cualquier divergencia con `products.stock`.
    stockAfter: integer('stock_after').notNull(),
  },
  (t) => [
    index('stock_movements_document_id_idx').on(t.documentId),
    // El índice que sostiene el kardex por producto del día que se construya (§11).
    index('stock_movements_product_id_idx').on(t.productId),
    // Un producto no puede aparecer dos veces en el mismo documento: sumar dos líneas
    // del mismo SKU es un error de captura, no un caso de negocio (AC8).
    uniqueIndex('stock_movements_document_product_idx').on(t.documentId, t.productId),
    // El invariante en la base y no solo en Zod, como `expenses_amount_cents_positive`:
    // ningún camino de escritura —seed, migración de datos o un `psql` a mano— debe
    // poder crear una línea de cero o negativa.
    check('stock_movements_quantity_positive', sql`${t.quantity} > 0`),
  ],
);
