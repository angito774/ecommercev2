import { pgEnum, pgTable, varchar } from 'drizzle-orm/pg-core';

import type { TransactionTypeCode } from '@/lib/inventory-transactions';

// Enum de Postgres y no varchar con CHECK: mismo criterio que `expense_category`
// (spec 017, D-4). Dos valores que no van a crecer y que Drizzle entrega como unión
// literal en TypeScript.
export const tipoTransaccion = pgEnum('tipo_transaccion', ['ingreso', 'salida']);

// Única tabla del esquema con nombres físicos en castellano, y es deliberado
// (spec 020, D-2): el requerimiento nombra la tabla y sus tres campos de forma
// literal, así que los nombres de Postgres son exactamente los pedidos —
// `transacciones`, `idtrans`, `nomtrans`, `tipotrans`— y las propiedades de
// TypeScript son las idiomáticas del resto del repo. El mapeo columna↔propiedad es
// justo para lo que existe el primer argumento de `varchar()`, y la excepción queda
// confinada a este archivo.
//
// `direction` y no `type`: los dos valores describen un sentido, y `type` competiría
// visualmente con la palabra reservada en cada `type X = …` del módulo.
export const transacciones = pgTable('transacciones', {
  // PK de texto y no uuid (D-3): es un catálogo cerrado de 6 filas, el código es
  // estable y legible en un JOIN a mano, y hace el seed idempotente sobre la propia
  // PK sin una columna `code` adicional que el requerimiento no pide.
  // `$type` y no un cast en el repositorio: la columna solo puede contener uno de los
  // 6 códigos del catálogo —es la PK a la que apunta la FK de la cabecera— y declararlo
  // aquí es lo que hace que los tipos se infieran del schema en vez de escribirse dos
  // veces (docs/SETUP.md §4, regla dura 5). No cambia el SQL: `$type` es solo TypeScript.
  id: varchar('idtrans', { length: 40 }).$type<TransactionTypeCode>().primaryKey(),
  name: varchar('nomtrans', { length: 60 }).notNull(),
  direction: tipoTransaccion('tipotrans').notNull(),
});
