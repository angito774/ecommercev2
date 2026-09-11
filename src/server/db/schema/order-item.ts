import { index, integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';

import { orders } from './order';
import { products } from './product';

// El detalle con precio congelado que docs/SETUP.md §5.3 reserva. Los `_snapshot`
// se copian de `products` en el instante de la compra y no se releen nunca: un
// pedido pasado debe mostrar el nombre y el precio que el cliente vio, no los de
// hoy.
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`: las líneas no significan nada sin su cabecera.
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // `restrict`, igual que `products.category_id`: borrar un producto vendido
    // dejaría el histórico sin referencia. Los productos se desactivan.
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    nameSnapshot: varchar('name_snapshot', { length: 160 }).notNull(),
    imageUrlSnapshot: varchar('image_url_snapshot', { length: 500 }),
    priceCentsSnapshot: integer('price_cents_snapshot').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [index('order_items_order_id_idx').on(t.orderId)],
);
