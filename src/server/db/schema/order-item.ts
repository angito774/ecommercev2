import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';

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
    // Cuarto `_snapshot` de la tabla y por la misma razón que los otros tres: un pedido
    // pasado debe decir lo que costó **entonces**, no lo que costaría hoy. Lo escribe el
    // webhook de fulfillment en la misma transacción que descuenta el stock (spec 027).
    //
    // **Nullable y sin default, a propósito.** `products.average_cost_cents` es nullable
    // (spec 021) y `null` significa «sin costo registrado»: un `0` diría «me costó gratis»
    // e inflaría la utilidad bruta con una afirmación falsa. El nulo viaja hasta la
    // pantalla como «cálculo parcial».
    costCentsSnapshot: integer('cost_cents_snapshot'),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    index('order_items_order_id_idx').on(t.orderId),
    // Mismo criterio que `products_average_cost_cents_positive`: un `0` o un negativo aquí
    // solo puede venir de un `psql` a mano o de una migración de datos, y ninguno de los
    // dos pasa por el código.
    check(
      'order_items_cost_cents_snapshot_positive',
      sql`${t.costCentsSnapshot} is null or ${t.costCentsSnapshot} > 0`,
    ),
  ],
);
