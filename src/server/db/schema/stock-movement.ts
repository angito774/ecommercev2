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
    // Costo unitario pagado, en céntimos. Solo lo llevan las líneas de un documento
    // `ingreso_compra`: una devolución o un cambio devuelven mercadería que ya se compró
    // a su precio, no una compra nueva (spec 021, D-2). Nullable también por historia:
    // las líneas anteriores a la migración `0009` no tienen importe y no se inventa
    // ninguno.
    unitCostCents: integer('unit_cost_cents'),
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
    // El invariante «si el documento es `ingreso_compra` la línea lleva costo» **no puede
    // ser un CHECK** (spec 021, D-3): el tipo de transacción vive en la cabecera
    // (`inventory_documents.transaccion_id`) y un CHECK de fila no lee otra tabla. Lo
    // sostienen el `superRefine` de `createInventoryDocumentSchema` y el service, que es
    // el único camino de escritura. Aquí solo cabe el signo del importe.
    check(
      'stock_movements_unit_cost_cents_positive',
      sql`${t.unitCostCents} is null or ${t.unitCostCents} > 0`,
    ),
  ],
);
