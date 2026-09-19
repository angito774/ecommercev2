import { date, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import type { TransactionTypeCode } from '@/lib/inventory-transactions';

import { transacciones } from './transaccion';
import { users } from './user';

// Cabecera de la nota de ingreso o de salida. **Sin `updated_at`, sin `voided_at` y
// sin `is_active`**: la tabla es append-only igual que `audit_logs`, no hay camino de
// UPDATE ni de DELETE desde la aplicación y la corrección de un documento es otro
// documento en sentido contrario (spec 020, D-9).
export const inventoryDocuments = pgTable(
  'inventory_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Correlativo legible para quien archiva la nota. Identidad de Postgres y no un
    // MAX()+1 en la aplicación: la secuencia es lo único que aguanta dos registros
    // simultáneos sin carrera (D-6). Deja huecos si una transacción revierte, y es
    // aceptable: el documento que falló no existió.
    docNumber: integer('doc_number').generatedAlwaysAsIdentity(),
    // "Tipo de transacción" de la cabecera del requerimiento. `restrict`: el catálogo
    // no se borra, y deja escrito que un documento no puede quedar sin tipo.
    transaccionId: varchar('transaccion_id', { length: 40 })
      .$type<TransactionTypeCode>()
      .notNull()
      .references(() => transacciones.id, { onDelete: 'restrict' }),
    // "Fecha doc". `date` con `mode: 'string'` y no `timestamptz`: un documento se
    // emite un día, no en un instante, y una columna sin hora no se desplaza de día
    // al cruzar el huso (mismo criterio que `expenses.incurred_on`).
    docDate: date('doc_date', { mode: 'string' }).notNull(),
    // "Documento de referencia": factura, guía de remisión, orden de compra, ticket de
    // préstamo. Nullable a propósito (D-8): no toda salida tiene papel detrás.
    reference: varchar('reference', { length: 120 }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inventory_documents_doc_number_idx').on(t.docNumber),
    // Sostiene el orden del listado y el filtro por rango.
    index('inventory_documents_doc_date_idx').on(t.docDate.desc()),
    index('inventory_documents_transaccion_id_idx').on(t.transaccionId),
  ],
);
