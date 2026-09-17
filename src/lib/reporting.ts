// Primitivas con las que el negocio corta sus días. Viven en `src/lib/` y no en un
// módulo de dominio porque «la zona horaria con la que se cierra un día» no es una
// propiedad del dashboard ni de finanzas: los dos la necesitan y que uno importara
// del otro invertiría la dependencia (spec 017, D-9). De paso,
// `metrics.repository.ts` —código de servidor— deja de importar de
// `@/modules/dashboard/constants`, que es un módulo de cliente.
//
// Módulo puro, como `permissions.ts`: sin Drizzle, sin Clerk y sin React, para que
// lo lean los dos lados.

// Zona de referencia del negocio: se cobra en PEN y se formatea en es-PE. Agrupar en
// UTC pondría una venta de las 20:00 de Lima en el día siguiente.
export const REPORTING_TIME_ZONE = 'America/Lima';

// Perú no aplica horario de verano desde 1994, así que el desfase es constante y todo
// el cálculo de rangos es aritmética de enteros: ni `Intl` en el camino caliente ni
// una librería de zonas horarias. Mover `REPORTING_TIME_ZONE` a un país con DST
// invalida esta constante y obliga a volver a `Intl`.
export const REPORTING_UTC_OFFSET_MINUTES = -300;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const OFFSET_MS = REPORTING_UTC_OFFSET_MINUTES * MS_PER_MINUTE;

// Instante UTC en el que empieza, en Lima, el día al que pertenece `instant`:
// desplazar al huso, truncar al día y volver.
export function startOfReportingDay(instant: Date): Date {
  const shifted = instant.getTime() + OFFSET_MS;
  return new Date(Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY - OFFSET_MS);
}

// Clave del día: el mismo `'YYYY-MM-DD'` que `to_char()` produce en SQL sobre
// `created_at at time zone 'America/Lima'`. Se construye con los getters UTC sobre el
// instante ya desplazado, nunca con `toISOString()` a secas, que daría el día de UTC.
export function toReportingDayKey(instant: Date): string {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');

  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

// Inversa de `toReportingDayKey`: el instante UTC en el que empieza ese día en Lima.
// Es lo que traduce un día elegido en un `<input type="date">` al extremo de una
// ventana sobre una columna `timestamptz`.
export function reportingDayStart(dayKey: string): Date {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - OFFSET_MS);
}

// Suma de días enteros sobre la clave, sin pasar por `Date` del lado del llamador.
// `days` puede ser negativo. Sin DST ningún día mide 23 o 25 horas, así que la suma
// de `MS_PER_DAY` es exacta y cruza fin de mes y fin de año sin casos especiales.
export function addReportingDays(dayKey: string, days: number): string {
  return toReportingDayKey(new Date(reportingDayStart(dayKey).getTime() + days * MS_PER_DAY));
}
