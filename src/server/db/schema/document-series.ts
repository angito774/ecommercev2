import { sql } from 'drizzle-orm';
import { check, integer, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

import { DOCUMENT_SERIES_KEYS } from '@/lib/electronic-documents';

// Los seis valores salen del catálogo puro y no de una tupla repetida aquí: es el mismo
// reparto que `transacciones` con `inventory-transactions.ts` (spec 020, D-1). Seis
// claves y no cuatro porque SUNAT exige que la serie de una nota de crédito o de débito
// empiece por la misma letra que el comprobante que modifica.
export const documentSeriesKey = pgEnum('document_series_key', DOCUMENT_SERIES_KEYS);

// Catálogo de 6 filas sembrado por `npm run db:seed`, mismo patrón que `transacciones`
// (spec 020, D-3): PK de texto estable, legible en un JOIN a mano e idempotente en el
// seed sin una columna `code` adicional.
//
// El correlativo vive aquí y no en una secuencia de Postgres **porque una secuencia no
// revierte**: un `nextval` consumido dentro de una transacción que después falla deja un
// hueco permanente en la numeración, y un hueco en la correlatividad de comprobantes es
// un problema ante SUNAT, no una curiosidad (spec 022, D-5, AC16).
export const documentSeries = pgTable(
  'document_series',
  {
    key: documentSeriesKey('key').primaryKey(),
    // 4 caracteres: una letra de tipo + tres dígitos (`B001`, `F001`).
    series: varchar('series', { length: 4 }).notNull().unique(),
    // 0 = todavía no se emitió ninguno. El primer documento de la serie es el 1.
    lastNumber: integer('last_number').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // El invariante en la base y no solo en el repositorio: ningún camino —seed,
    // migración de datos o un `psql` a mano— debe poder dejar el correlativo negativo.
    check('document_series_last_number_positive', sql`${t.lastNumber} >= 0`),
  ],
);
