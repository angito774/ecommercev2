// Catálogo de tipos de transacción de inventario. Módulo deliberadamente puro —sin
// Drizzle, sin Clerk y sin React— con el mismo reparto que `permissions.ts`: la
// fuente de verdad vive en el código, la tabla `transacciones` existe para dar
// integridad referencial y para que la base sea legible sin el repo, y `db:seed` las
// mantiene sincronizadas (spec 020, D-1).
//
// Que el catálogo esté aquí es lo que permite validar con `z.enum` en el borde —un
// tipo desconocido es 400 y no un 500 por violación de clave foránea (AC7)— y pintar
// el `Select` del modal sin una petición extra (D-4).

export const TRANSACTION_TYPES = [
  { id: 'salida_venta', name: 'Salida por venta', direction: 'salida' },
  { id: 'salida_cambio', name: 'Salida por cambio', direction: 'salida' },
  { id: 'salida_prestamo', name: 'Salida por préstamo', direction: 'salida' },
  { id: 'ingreso_devolucion', name: 'Ingreso por devolución', direction: 'ingreso' },
  { id: 'ingreso_compra', name: 'Ingreso por compra', direction: 'ingreso' },
  { id: 'ingreso_cambio', name: 'Ingreso por cambio', direction: 'ingreso' },
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionTypeCode = TransactionType['id'];
export type TransactionDirection = TransactionType['direction'];

// Tupla no vacía y no `string[]`: `z.enum()` la consume tal cual y de ahí sale la
// unión literal de los 6 códigos en el schema de entrada.
export const TRANSACTION_TYPE_CODES = TRANSACTION_TYPES.map((type) => type.id) as unknown as [
  TransactionTypeCode,
  ...TransactionTypeCode[],
];

// El único tipo que además de mover stock recalcula el costo promedio ponderado del
// producto (spec 021, D-2). Vive aquí, junto al catálogo, y no en el schema ni en el
// diálogo: la condición la comprueban tres piezas —el `superRefine` de la API, el del
// formulario y la columna de costo del modal— y con el literal repetido en las tres
// bastaría con cambiarlo en dos para que el campo se pidiera sin que nada lo validara.
export const PURCHASE_TRANSACTION_ID = 'ingreso_compra' satisfies TransactionTypeCode;

const TYPE_BY_CODE = new Map<string, TransactionType>(
  TRANSACTION_TYPES.map((type) => [type.id, type]),
);

// Postgres devuelve `idtrans` como texto libre. El guarda estrecha el tipo sin
// castear y descarta filas que quedaran en la base tras retirar un tipo del catálogo:
// lo que no está en el código no existe, igual que con `isPermissionCode()`.
export function isTransactionTypeCode(value: string): value is TransactionTypeCode {
  return TYPE_BY_CODE.has(value);
}

export function transactionTypesByDirection(
  direction: TransactionDirection,
): readonly TransactionType[] {
  return TRANSACTION_TYPES.filter((type) => type.direction === direction);
}

// El código llega ya validado por Zod contra este mismo catálogo, así que el `get`
// no puede fallar; el `!` sería un cast silencioso y esto deja el caso imposible a
// la vista si alguna vez deja de serlo.
export function transactionDirection(code: TransactionTypeCode): TransactionDirection {
  const type = TYPE_BY_CODE.get(code);
  if (!type) throw new Error(`Tipo de transacción desconocido: ${code}`);
  return type.direction;
}
