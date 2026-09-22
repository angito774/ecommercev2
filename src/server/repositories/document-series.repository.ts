import { eq, sql, type SQL } from 'drizzle-orm';

import type { DocumentSeriesKey } from '@/lib/electronic-documents';
import { type Tx } from '@/server/db';
import { documentSeries } from '@/server/db/schema';

export type AssignedNumber = { series: string; number: number };

// El incremento como expresión sobre la propia columna y no como literal calculado en
// TypeScript (mismo criterio que `buildStockChangeExpression`, spec 020 D-7): en un
// `UPDATE` todas las referencias del `SET` ven los valores previos de la fila, así que
// leer, sumar uno en TypeScript y volver a escribir dejaría que dos emisiones simultáneas
// de la misma serie consumieran el mismo número.
//
// Exportada para compilarla con `PgDialect` en el test: es la pieza con la regla, y el
// resto de `nextNumber` es fontanería de Drizzle.
export function buildNextNumberExpression(): SQL {
  return sql`${documentSeries.lastNumber} + 1`;
}

// Serie mal sembrada = configuración rota, no dato de negocio: se lanza en vez de
// devolver `null`. Un `null` obligaría a cada llamador a decidir qué hacer sin comprobante
// que numerar, y la respuesta correcta es siempre la misma —revertir la transacción—.
export function missingSeriesMessage(key: DocumentSeriesKey): string {
  return `La serie «${key}» no está sembrada en document_series. Ejecuta npm run db:seed.`;
}

/**
 * `UPDATE … SET last_number = last_number + 1 … RETURNING series, last_number`, y no un
 * `SELECT` seguido de un `UPDATE`: el `UPDATE` toma el lock de fila, así que dos emisiones
 * simultáneas de la misma serie se serializan en el motor y salen con números distintos y
 * consecutivos (AC17).
 *
 * Exige `Tx` —nunca el `db` global— porque el número solo debe consumirse si la fila del
 * documento llega a existir: si la transacción revierte, el correlativo vuelve atrás y no
 * queda ningún hueco en la numeración, que es justo lo que una secuencia de Postgres no
 * sabe hacer (D-5, AC16).
 */
export async function nextNumber(tx: Tx, key: DocumentSeriesKey): Promise<AssignedNumber> {
  const [assigned] = await tx
    .update(documentSeries)
    .set({ lastNumber: buildNextNumberExpression() })
    .where(eq(documentSeries.key, key))
    // `last_number` **después** del incremento: es el número de este documento. El
    // `RETURNING` de Postgres devuelve la fila ya actualizada, así que no hay que sumar
    // uno otra vez al leerlo.
    .returning({ series: documentSeries.series, number: documentSeries.lastNumber });

  if (!assigned) throw new Error(missingSeriesMessage(key));

  return assigned;
}
