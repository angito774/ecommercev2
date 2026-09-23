---
id: 028
title: Contabilidad — Registro de Ventas y Registro de Compras con exportación CSV
status: done
module: finance
scope: admin
created: 2026-09-23
---

# 028 — Contabilidad: Registro de Ventas y Registro de Compras

## 1. Contexto

El módulo financiero tiene hoy tres pantallas —resumen (017, 024, 025, 027),
precio unitario (021) e impuestos (026)— y **todas publican agregados**: sumas,
netos, márgenes. Ninguna deja ver los documentos uno por uno, que es
exactamente lo que un contador necesita para cruzar contra el SIRE de SUNAT.

Es el **sub-proyecto #6 del roadmap de Finanzas**
(`docs/superpowers/specs/2026-09-21-modulo-finanzas-design.md`) y el último. Su
diseño previo es `docs/superpowers/specs/2026-09-21-contabilidad-design.md`, que
cerró con el usuario dos cosas: que se exporta un **CSV legible y no el formato
PLE exacto** —SUNAT arma el registro oficial en el SIRE a partir de lo que el OSE
ya le reportó al emitir (§2 de aquel documento)— y que la pantalla vive en
`/admin/finance/accounting` con dos pestañas.

Es la primera pieza del roadmap que **no agrega nada**: es pura lectura sobre
`electronic_documents` (022, 023) y `expenses` (024), y la primera que exporta
—017 dejó la exportación reservada a propósito en su D-13, y `docs/SETUP.md:1090`
la anota explícitamente como fuera de alcance de 025 «hasta el sub-proyecto que
la pida»—.

## 2. Objetivo

Una persona con `finance.read` abre `/admin/finance/accounting`, elige un rango y
ve **cada documento fiscal emitido y cada comprobante de compra registrado** del
período en dos tablas paginadas, y descarga cualquiera de las dos como CSV con el
mismo rango aplicado.

## 3. Alcance

### Incluye

- **Registro de Ventas**: una fila por `electronic_documents` con
  `status = 'issued'` cuyo `issued_at` cae en el rango, **incluidas las notas de
  crédito y de débito**, con la serie-número del documento que corrigen.
- **Registro de Compras**: una fila por `expenses` con `receipt_type` no nulo
  cuyo `incurred_on` cae en el rango, con su marca de crédito fiscal derivada de
  `grantsTaxCredit()`.
- Exportación a **CSV** de cada registro, con el rango de fechas activo y **sin
  paginar**: el archivo trae todas las filas del rango.
- Página nueva `/admin/finance/accounting` con dos pestañas, el mismo filtro de
  rango del resto del módulo (mes en curso por defecto) y una entrada más en la
  navegación del panel, bajo `finance.read`.

### No incluye (explícito)

- **Formato PLE exacto de SUNAT** (TXT pipe-delimited con el nombre de archivo
  normativo). Decisión de negocio cerrada en el brainstorming §2.
- **`.xlsx`**: exigiría una dependencia nueva para producir un binario que no se
  puede auditar a ojo (D-2).
- **Libro Diario, Libro Mayor y plan de cuentas.** El roadmap solo pidió los dos
  registros; la partida doble es un sub-proyecto en sí mismo.
- **Integración con el SIRE** ni ningún envío a SUNAT. Esta pantalla exporta para
  que una persona revise.
- **La `comunicacion_baja` como fila del registro** (D-8): no consume serie ni
  número propios y no lleva importes —`CHECK electronic_documents_void_has_no_amount`
  y `..._void_has_no_series`—, así que no es un comprobante que cruzar contra el
  SIRE.
- **Los documentos `voided`, `pending` y `failed`.** El registro lista lo que
  existe ante SUNAT hoy. Sus consecuencias están en §10.
- **Totales al pie, gráficos, filtros por tipo de documento, serie o proveedor, y
  búsqueda.** El rango es el único filtro, igual que en el resto del módulo.
- **Ningún permiso nuevo, ninguna tabla nueva, ninguna columna nueva y ninguna
  migración.** El catálogo sigue en 29 códigos y el journal de `drizzle/` se queda
  donde está.

## 4. Criterios de aceptación

- [ ] AC1 — Dado un visitante sin sesión, cuando pide cualquiera de los cuatro
      endpoints nuevos, entonces recibe `401` con cuerpo `{ message }` y no un
      `307` al formulario de Clerk.
- [ ] AC2 — Dado un usuario con sesión y sin `finance.read`, cuando pide
      cualquiera de los cuatro endpoints con una query inválida, entonces recibe
      `403` y no `400`: se autoriza antes de mirar la query.
- [ ] AC3 — Dado un usuario sin `finance.read`, cuando abre
      `/admin/finance/accounting`, entonces la página responde `403` vía
      `requirePagePermission('finance.read')` y `src/app/forbidden.tsx`, aunque el
      layout no lo hubiera retirado de la navegación.
- [ ] AC4 — Dado el Registro de Ventas de un rango, entonces trae **todas** las
      filas de `electronic_documents` con `status = 'issued'` e `issued_at` en el
      rango cuyo `kind` no es `comunicacion_baja`, **sin** la condición del padre
      de `buildDeclarableFilter()`.
- [ ] AC5 — Dada una nota de crédito que dejó `voided` a su original (motivos 01,
      06, 02 o 03), entonces la nota **sí** aparece en el Registro de Ventas de su
      rango, aunque `findDeclarableSalesByKind()` la descarte: son dos preguntas
      distintas y esta lista documentos, no un neto.
- [ ] AC6 — Dada la ventana del rango de ventas, entonces es la **misma
      semiabierta** `[from, to)` sobre `issued_at` que usa
      `buildDeclarableFilter()`, derivada del mismo `resolveFinanceRange()`: un
      documento no puede caer en el registro de un mes y en el neto de otro.
- [ ] AC7 — Dada una nota de crédito o de débito, entonces su fila trae la
      serie-número del documento que corrige, resuelta por `related_document_id` y
      no por la letra de la serie; un original la trae vacía.
- [ ] AC8 — Dado el tipo y número de documento del comprador, entonces salen de
      `orders`, por `innerJoin` sobre la clave primaria, y **no** de
      `electronic_documents`, que no los guarda.
- [ ] AC9 — Dado el Registro de Compras de un rango, entonces trae las filas de
      `expenses` con `receipt_type is not null` y `incurred_on` entre `fromDay` y
      `toDay` **con los dos extremos inclusive**, reutilizando
      `buildExpenseFilters()` y nunca la ventana semiabierta de los instantes.
- [ ] AC10 — Dado un gasto sin comprobante, entonces **no** aparece en el Registro
      de Compras, y sigue apareciendo en el listado de Egresos como siempre.
- [ ] AC11 — Dada la marca de crédito fiscal de una compra, entonces se deriva con
      `grantsTaxCredit()` del catálogo puro, **no** se publica como campo del
      contrato ni se decide con una lista escrita en este módulo (024, AC16).
- [ ] AC12 — Dada la base imponible de una compra, entonces es
      `amount_cents − igv_cents` cuando hay IGV calculado y el importe completo
      cuando no lo hay; nunca se inventa una base con un 18 % sobre un recibo por
      honorarios.
- [ ] AC13 — Dado el orden de los dos registros, entonces es **cronológico
      ascendente** con desempate total (`issued_at, series, number, id` en ventas;
      `incurred_on, created_at, id` en compras), y la paginación no repite ni
      salta filas entre páginas.
- [ ] AC14 — Dado el CSV exportado, entonces empieza con el BOM de UTF-8
      (`﻿`), separa con coma, termina cada línea en `\r\n` y su primera línea
      son las cabeceras en español.
- [ ] AC15 — Dado un campo que contiene una coma, unas comillas o un salto de
      línea, entonces viaja entrecomillado y con las comillas internas duplicadas
      (RFC 4180).
- [ ] AC16 — Dado un campo de texto que empieza por `=`, `+`, `-`, `@`, tabulador
      o retorno de carro —por ejemplo una razón social tecleada como
      `=CMD(...)`—, entonces se prefija con un apóstrofo, y **un importe negativo
      no se toca**: el guard solo actúa sobre lo que no es un número.
- [ ] AC17 — Dados los importes del CSV, entonces son soles con dos decimales, sin
      símbolo de moneda y sin separador de miles (`-1234.56`), para que Excel y
      Sheets los lean como número; la división por 100 es aritmética entera y no
      `cents / 100` en coma flotante.
- [ ] AC18 — Dada la fecha del CSV, entonces es el día en **Lima**
      (`toReportingDayKey`), no el instante UTC: un comprobante emitido el 30 a las
      22:00 de Lima pertenece al día 30 y no al 1 del mes siguiente.
- [ ] AC19 — Dada la exportación, entonces **no pagina**: descarga todas las filas
      del rango, sin tope que trunque en silencio.
- [ ] AC20 — Dado el botón «Exportar CSV», entonces manda el **mismo rango**
      aplicado en el filtro, y el archivo se llama
      `registro-ventas-<from>_<to>.csv` / `registro-compras-<from>_<to>.csv`, con
      el nombre construido por **la misma función pura** en el servidor
      (`Content-Disposition`) y en el cliente (`a.download`).
- [ ] AC21 — Dada la respuesta del CSV, entonces su `Content-Type` es
      `text/csv; charset=utf-8` y su `Cache-Control` es `no-store`: un archivo con
      RUCs, razones sociales e importes no se queda en ninguna caché intermedia.
- [ ] AC22 — Dado un fallo de la exportación, entonces **no se descarga ningún
      archivo**: el error llega como toast y el usuario se queda en la pantalla.
- [ ] AC23 — Dado un rango sin documentos, entonces la tabla muestra su estado
      vacío con copy propio (no un error) y el CSV descargado trae **solo la línea
      de cabeceras**.
- [ ] AC24 — Dada la primera carga de cada pestaña, entonces la tabla muestra
      esqueletos; ante un fallo de red muestra su mensaje con «Reintentar»; y al
      cambiar de rango conserva las filas anteriores (`keepPreviousData`).
- [ ] AC25 — Dado el catálogo de permisos, entonces sigue en 29 códigos, y las
      cuatro entradas de Finanzas del sidebar aparecen y desaparecen juntas con
      `finance.read`.
- [ ] AC26 — Dado el esquema, entonces `drizzle/` **no gana ninguna migración** y
      ninguna tabla cambia.
- [ ] AC27 — Dada la arquitectura, entonces ningún componente importa `db`,
      Drizzle ni un repositorio, y ninguno llama a `axios` directo: la página
      consume hook → service → Route Handler → repositorio.
- [ ] AC28 — Dada la lista de `kind` del Registro de Ventas, entonces se deriva
      del catálogo (`NUMBERED_DOCUMENT_KINDS`) y no de una tupla escrita a mano:
      añadir un `kind` nuevo al catálogo lo incluye sin tocar este módulo.

## 5. Modelo de datos

**Sin cambios de esquema.** Ninguna tabla, ninguna columna, ningún `CHECK`,
ninguna migración y ningún permiso nuevos (AC26). Todo lo que este spec lee existe
ya:

| Dato | Origen verificado |
|---|---|
| Fecha de emisión, tipo, serie, número, base, IGV, total | `electronic_documents` (`electronic-document.ts:58-77`) |
| Documento corregido | `electronic_documents.related_document_id` (self-FK, `:54-57`) |
| Tipo/número de documento y razón social del comprador | `orders.buyer_document_type`, `buyer_document_number`, `buyer_legal_name` (`order.ts:61-64`) — **no están en `electronic_documents`** |
| Fecha, RUC, razón social, tipo, serie, número e IGV de compra | `expenses` tras 024 (`expense.ts:66-75`) |
| Elegibilidad de crédito fiscal | `grantsTaxCredit()` / `TAX_CREDIT_RECEIPT_TYPES` (`src/lib/purchase-receipts.ts:51-60`) |

### 5.1 Índices — verificado, no hace falta ninguno nuevo

- **Ventas.** La tabla conductora es `electronic_documents`, acotada por
  `issued_at`: la sostiene `electronic_documents_issued_at_idx`
  (`electronic-document.ts:131`), el mismo que ya usan 025 y 026. El join a
  `orders` es `orders.id = electronic_documents.order_id`, así que el lado
  buscado es la **clave primaria de `orders`** y lo resuelve `orders_pkey`.
  `electronic_documents_order_id_idx` (`:108`) sirve al camino contrario —los
  documentos de un pedido— y no participa en este plan; tampoco hace falta
  tocarlo. El auto-join al padre es `p.id = d.related_document_id`: otra vez la
  clave primaria, que es la razón por la que 025 ya dejó escrito que no hace
  falta índice sobre `related_document_id` (`finance.repository.ts:166`).
- **Compras.** `expenses_incurred_on_idx` (`expense.ts:81`) acota el rango;
  `receipt_type is not null` es un predicado residual sobre las filas que el
  rango ya seleccionó. Un índice parcial por `receipt_type` no se pagaría: mismo
  criterio que 024 D-11 y 027 D-13, y `expenses` crece a ritmo de registro
  manual.

## 6. Contratos de API

Cuatro rutas nuevas, todas `GET` y todas bajo `finance.read`. Dos devuelven JSON
paginado y dos devuelven `text/csv`.

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/finance/accounting/sales` | `finance.read` | query: `from?`, `to?`, `page?`, `pageSize?` | `SalesRegistryResponse` | 400, 401, 403, 500 |
| GET | `/api/admin/finance/accounting/sales/export` | `finance.read` | query: `from?`, `to?` | `text/csv; charset=utf-8` | 400, 401, 403, 500 |
| GET | `/api/admin/finance/accounting/purchases` | `finance.read` | query: `from?`, `to?`, `page?`, `pageSize?` | `PurchaseRegistryResponse` | 400, 401, 403, 500 |
| GET | `/api/admin/finance/accounting/purchases/export` | `finance.read` | query: `from?`, `to?` | `text/csv; charset=utf-8` | 400, 401, 403, 500 |

Un rango sin documentos es `200` con `data: []` (o con solo la cabecera en el
CSV), nunca `404`: el recurso «registro del rango» existe siempre (AC23).

Cabeceras de las dos exportaciones (AC20, AC21):

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="registro-ventas-2026-09-01_2026-09-30.csv"
Cache-Control: no-store
```

### 6.1 Entrada — `src/modules/finance/schemas/accounting.schema.ts` (nuevo)

Las dos exportaciones reutilizan `financeRangeSchema` tal cual. Los dos listados
necesitan además paginación:

```ts
import { dayKey, invertedRangeIssue, isOrderedRange } from './finance.schema';

// Sin `category`, sin `search` y sin `sortBy`: el rango es el único filtro de esta
// pantalla (§3), y la firma es lo que lo hace cumplir.
export const accountingQuerySchema = z
  .object({
    from: dayKey.optional(),
    to: dayKey.optional(),
    page: z.coerce.number().int().min(1).default(1),
    // Mismo tope que `expenseQuerySchema`: la vía para llevarse el rango entero es la
    // exportación, no un `?pageSize=100000` que traiga la tabla en un JSON.
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(isOrderedRange, invertedRangeIssue());

export type AccountingQueryParams = z.output<typeof accountingQuerySchema>;
```

`dayKey`, `isOrderedRange` e `invertedRangeIssue` viven hoy privados en
`finance.schema.ts:32-46`. Este es su **tercer** consumidor —`financeRangeSchema`,
`expenseQuerySchema` y este—, que es justo el umbral de extracción de CLAUDE.md §6:
se exportan desde donde están y no se copian (T3).

### 6.2 Salida — `src/modules/finance/types/accounting.types.ts` (nuevo)

Archivo propio y no un apéndice de `finance.types.ts` (252 líneas, agregados del
resumen y de impuestos), con el precedente de `pricing.types.ts`.

```ts
import type { NumberedDocumentKind } from '@/lib/electronic-documents';
import type { PurchaseReceiptType } from '@/lib/purchase-receipts';
import type { orders } from '@/server/db/schema';

type Order = typeof orders.$inferSelect;

// Una fila del Registro de Ventas: **un documento fiscal**, no un neto. Por eso no hay
// signo ni resta en ninguna parte — el signo es del agregado de 025/026, y aquí cada
// documento se lee tal y como se emitió.
export type SalesRegistryRow = {
  id: string;
  /** ISO del `issued_at`. El día de Lima lo deriva quien pinta, con `toReportingDayKey` (D-16). */
  issuedAt: string;
  kind: NumberedDocumentKind;
  /** `F001-00000123`, ya formateado con `formatDocumentLabel` (padding de 8 dígitos). */
  label: string | null;
  /** De `orders`, no de `electronic_documents` (AC8). */
  buyerDocumentType: Order['buyerDocumentType'];
  buyerDocumentNumber: string | null;
  /** Solo en factura: el `CHECK orders_buyer_legal_name_requires_ruc` lo garantiza. */
  buyerLegalName: string | null;
  /** Los tres nullables porque la columna lo es; nunca `0`, que afirmaría «importe cero». */
  baseCents: number | null;
  igvCents: number | null;
  amountCents: number | null;
  /** Serie-número del documento que corrige; `null` en un original (AC7). */
  relatedLabel: string | null;
};

// Una fila del Registro de Compras. **No publica si otorga crédito fiscal**: es derivable
// de `receiptType` con `grantsTaxCredit()`, módulo puro que importan igual el CSV del
// servidor y la tabla del cliente. Publicarlo sería una segunda fuente de la misma regla
// (024, AC16; AC11).
export type PurchaseRegistryRow = {
  id: string;
  /** `'YYYY-MM-DD'` tal cual: `incurred_on` es `date` con `mode: 'string'`. */
  incurredOn: string;
  /** Nullables aunque el `WHERE` los garantice; ver D-14. */
  receiptType: PurchaseReceiptType | null;
  supplierRuc: string | null;
  supplierName: string | null;
  /** `F001-00001234` con los ceros como se registraron; `null` si se anotó sin serie. */
  label: string | null;
  /** `amountCents − igvCents`, o el importe completo si el tipo no es afecto (AC12). */
  baseCents: number;
  /** `null` cuando el comprobante no lleva IGV. Nunca `0` (024, D-5). */
  igvCents: number | null;
  amountCents: number;
};

// Mismo `meta` que el resto del módulo, más la paginación del listado de gastos: el
// rango resuelto en el servidor es lo que rotula la UI y lo que hace visible un error de
// huso en la propia respuesta.
type RegistryMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  range: { from: string; to: string };
  timeZone: string;
  generatedAt: string;
};

export type SalesRegistryResponse = { data: SalesRegistryRow[]; meta: RegistryMeta };
export type PurchaseRegistryResponse = { data: PurchaseRegistryRow[]; meta: RegistryMeta };
```

### 6.3 Catálogo — `src/lib/electronic-documents.ts`

```ts
/**
 * Los `kind` que consumen serie y número propios y llevan importes: todos menos la
 * comunicación de baja. **Derivado del catálogo, no escrito a mano** (AC28), igual que
 * `TAX_CREDIT_RECEIPT_TYPES` se deriva de `PURCHASE_RECEIPT_RULES` (024, D-4).
 *
 * Es la misma frontera que ya traza `seriesKeyFor()`, que devuelve `null` exactamente
 * para `comunicacion_baja`, y la que fijan los `CHECK electronic_documents_void_has_no_series`
 * y `..._void_has_no_amount`.
 */
export type NumberedDocumentKind = Exclude<ElectronicDocumentKind, 'comunicacion_baja'>;

export const NUMBERED_DOCUMENT_KINDS = ELECTRONIC_DOCUMENT_KINDS.filter(
  (kind): kind is NumberedDocumentKind => kind !== 'comunicacion_baja',
);
```

### 6.4 Repositorio — `src/server/repositories/accounting.repository.ts` (nuevo)

```ts
import type { DayRange, InstantRange } from './finance.repository';
import { buildExpenseFilters } from './finance.repository';

/**
 * La regla del Registro de Ventas: `issued` + ventana semiabierta de `issued_at` + los
 * `kind` numerados. **Deliberadamente NO reutiliza `buildDeclarableFilter()`** (D-1).
 * Exportada para compilarla con `PgDialect`: es la pieza con las reglas.
 */
export function buildSalesRegistryFilter(range: InstantRange): SQL;

/** El de compras **sí** compone el de gastos, que es la definición de «gasto del rango» (D-3). */
export function buildPurchaseRegistryFilter(range: DayRange): SQL;

/** Paginación explícita; `null` = sin `limit`/`offset`, que es lo que pide la exportación (D-7). */
export type RegistryPagination = { page: number; pageSize: number } | null;

export type SalesRegistryResult = { data: SalesRegistryRow[]; total: number };
export type PurchaseRegistryResult = { data: PurchaseRegistryRow[]; total: number };

export async function findSalesRegistry(
  range: InstantRange,
  pagination: RegistryPagination,
  reader?: Reader,
): Promise<SalesRegistryResult>;

export async function findPurchaseRegistry(
  range: DayRange,
  pagination: RegistryPagination,
  reader?: Reader,
): Promise<PurchaseRegistryResult>;
```

SQL del Registro de Ventas:

```sql
select d.id, d.issued_at, d.kind, d.series, d.number,
       o.buyer_document_type, o.buyer_document_number, o.buyer_legal_name,
       d.base_cents, d.igv_cents, d.amount_cents,
       p.series as related_series, p.number as related_number
  from electronic_documents d
  join orders o on o.id = d.order_id                       -- PK de orders (AC8)
  left join electronic_documents p on p.id = d.related_document_id
 where d.status = 'issued'
   and d.issued_at >= $from and d.issued_at < $to          -- misma ventana que 025/026 (AC6)
   and d.kind in (<NUMBERED_DOCUMENT_KINDS>)
 order by d.issued_at asc, d.series asc, d.number asc, d.id asc
 limit $n offset $m                                        -- solo en el listado
```

El conteo va en su propia consulta y **sin los joins**: los tres filtros viven en
`electronic_documents`, igual que `findManyExpenses()` cuenta sin unir `users`
(`finance.repository.ts:564`). Con `pagination === null` no se ejecuta: el total
es `data.length`.

SQL del Registro de Compras:

```sql
select id, incurred_on, receipt_type, supplier_ruc, supplier_name,
       receipt_series, receipt_number, igv_cents, amount_cents
  from expenses
 where incurred_on >= $fromDay and incurred_on <= $toDay   -- buildExpenseFilters (AC9)
   and receipt_type is not null
 order by incurred_on asc, created_at asc, id asc
 limit $n offset $m
```

Mapeo a fila publicada: `label = formatDocumentLabel(series, number)` en ventas y
`series && number ? \`${series}-${number}\` : null` en compras —sin padding: el
correlativo de una compra se registra tal y como está impreso (024, D-14)—;
`relatedLabel = formatDocumentLabel(relatedSeries, relatedNumber)`;
`baseCents = amountCents - (igvCents ?? 0)`.

### 6.5 CSV — dos módulos puros

**No existe ningún patrón de exportación previo que seguir**, verificado: en todo
`src/` no aparece ni una vez `csv`, `text/csv`, `Content-Disposition`, `Blob` ni
`createObjectURL` —el único `csv` del árbol es una extensión más en el `matcher`
de `src/proxy.ts:19`—, y las menciones de `docs/SETUP.md` (líneas 802, 879, 931,
1090, 1393) son todas de funcionalidad **no construida**. Este spec fija el
patrón, y por eso las decisiones de formato se documentan aquí (D-4, D-5, D-15)
en vez de heredarse.

`src/modules/finance/lib/csv.ts` — el serializador, sin nada de contabilidad:

```ts
/** BOM de UTF-8. Sin él, Excel en Windows lee las tildes y la ñ como mojibake (AC14). */
export const CSV_BOM = '﻿';

/**
 * Serializa a CSV RFC 4180: coma como separador, `\r\n` como fin de línea, comillas
 * duplicadas dentro de campos entrecomillados, y el BOM delante — **el BOM es parte del
 * contrato de esta función**, no algo que cada llamador recuerde prefijar.
 *
 * Además neutraliza la inyección de fórmulas (AC16): un campo que **no es un número** y
 * empieza por `=`, `+`, `-`, `@`, TAB o CR se prefija con un apóstrofo. La excepción
 * numérica es lo que deja pasar `-1234.56` como importe y no como texto.
 */
export function toCsv(rows: readonly (readonly string[])[]): string;

/**
 * Céntimos → soles con dos decimales, sin símbolo ni separador de miles: `-1234.56`.
 * **Aritmética entera** (`trunc` + `abs` + `padStart`), no `cents / 100` en coma
 * flotante (AC17).
 */
export function formatCsvAmount(cents: number): string;

/** `''` para el importe ausente: nunca `0.00`, que afirmaría un importe de cero. */
export function formatCsvAmountOrEmpty(cents: number | null): string;
```

`src/modules/finance/lib/accounting-csv.ts` — las dos tablas y el nombre del
archivo. Puro también: lo importan el Route Handler (servidor) y el service
(cliente, solo para el nombre).

```ts
export const SALES_REGISTRY_HEADERS = [
  'Fecha de emisión', 'Tipo de documento', 'Serie-Número',
  'Tipo de documento del comprador', 'Número de documento del comprador',
  'Razón social', 'Base imponible', 'IGV', 'Total', 'Documento que modifica',
] as const;

export const PURCHASE_REGISTRY_HEADERS = [
  'Fecha', 'RUC del proveedor', 'Razón social del proveedor',
  'Tipo de comprobante', 'Serie-Número', 'Base imponible', 'IGV', 'Total',
  'Crédito fiscal',
] as const;

export function salesRegistryCsv(rows: readonly SalesRegistryRow[]): string;
export function purchaseRegistryCsv(rows: readonly PurchaseRegistryRow[]): string;

/** `registro-ventas-2026-09-01_2026-09-30.csv`. Mismo nombre en el header y en el `download` (AC20). */
export function registryFileName(registry: 'sales' | 'purchases', range: FinanceRange): string;
```

Reglas de celda: la fecha es `toReportingDayKey(new Date(issuedAt))` en ventas
(AC18) e `incurredOn` tal cual en compras; el tipo se rotula con
`ELECTRONIC_DOCUMENT_KIND_LABELS` / `PURCHASE_RECEIPT_TYPE_LABELS`; el crédito
fiscal es `Sí`/`No` según `grantsTaxCredit(receiptType)` y `''` si el tipo
faltara (AC11); todo ausente es celda vacía, nunca `0.00` ni `null`.

### 6.6 Forma de los handlers

Los cuatro autorizan **antes** de mirar la query (AC2) y resuelven el rango con
`resolveFinanceRange(parsed.data, now)`, con un único `new Date()` para el rango y
para `generatedAt`. El de exportación, además:

```ts
const { data } = await accountingRepository.findSalesRegistry(range, null);

return new NextResponse(salesRegistryCsv(data), {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${registryFileName('sales', {
      from: range.fromDay,
      to: range.toDay,
    })}"`,
    'Cache-Control': 'no-store',
  },
});
```

`NextResponse` con cuerpo de texto y no `NextResponse.json`; los errores siguen
saliendo por `toErrorResponse()` como JSON, que es lo que el cliente convierte en
toast (AC22).

## 7. Arquitectura y archivos afectados

- `src/lib/electronic-documents.ts` — `NumberedDocumentKind` y
  `NUMBERED_DOCUMENT_KINDS`.
- `src/lib/electronic-documents.test.ts` — su test.
- `src/modules/finance/schemas/finance.schema.ts` — exporta `dayKey`,
  `isOrderedRange` e `invertedRangeIssue` (tercer consumidor).
- `src/modules/finance/schemas/accounting.schema.ts` + `.test.ts` — **nuevos**.
- `src/modules/finance/types/accounting.types.ts` — **nuevo**.
- `src/server/repositories/accounting.repository.ts` + `.test.ts` — **nuevos**.
- `src/app/api/admin/finance/accounting/sales/route.ts` — **nuevo**.
- `src/app/api/admin/finance/accounting/sales/export/route.ts` — **nuevo**.
- `src/app/api/admin/finance/accounting/purchases/route.ts` — **nuevo**.
- `src/app/api/admin/finance/accounting/purchases/export/route.ts` — **nuevo**.
- `src/modules/finance/lib/csv.ts` + `.test.ts` — **nuevos**.
- `src/modules/finance/lib/accounting-csv.ts` + `.test.ts` — **nuevos**.
- `src/modules/finance/services/accounting.service.ts` — **nuevo**.
- `src/modules/finance/constants.ts` — claves de query, tamaño de página y copys.
- `src/modules/finance/hooks/use-sales-registry.ts`,
  `use-purchase-registry.ts`, `use-registry-export.ts` — **nuevos**.
- `src/modules/finance/components/sales-registry-columns.tsx`,
  `purchase-registry-columns.tsx`, `sales-registry-table.tsx`,
  `purchase-registry-table.tsx`, `registry-export-button.tsx`,
  `accounting-tabs.tsx` — **nuevos**.
- `src/app/(admin)/admin/finance/accounting/page.tsx` — **nueva**.
- `src/app/(admin)/admin/layout.tsx` — una entrada más en `NAV_ITEMS`, detrás de
  «Impuestos» y con `finance.read`.
- `docs/SETUP.md` — §6 (la cuarta pantalla del módulo) y la línea 1090, que hoy
  dice que la exportación del Registro de Ventas está fuera de alcance.

**Sin cambios**, y conviene escribirlo para que no se toquen:
`buildDeclarableFilter()`, `findDeclarableSalesByKind()`,
`findDeclarableTaxTotals()`, `findExpenseTotals()`, `findManyExpenses()` —
`buildExpenseFilters()` se **usa**, no se edita—; `src/lib/purchase-receipts.ts`;
`src/lib/permissions.ts`; todo `src/server/db/schema/`; `drizzle/`; y las tres
pantallas financieras existentes.

Flujo, capa por capa, sin saltos:

```
AccountingTabs ("use client")
  → useSalesRegistry / usePurchaseRegistry (TanStack Query)
  → useRegistryExport (TanStack Mutation)
    → accounting.service (axios)
      → /api/admin/finance/accounting/**   (authorize → Zod → resolveFinanceRange)
        → accounting.repository (Drizzle) → Neon
```

Los componentes de columnas y tablas reciben datos por props o por hook y no
importan nada de `@/server` salvo tipos; los únicos módulos compartidos que
cruzan la frontera son los puros (`electronic-documents.ts`,
`purchase-receipts.ts`, `reporting.ts`, `csv.ts`, `accounting-csv.ts`) (AC27).

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: El Registro de Ventas usa un filtro propio y **no** `buildDeclarableFilter()` | Reutilizar el filtro de 025/026 «porque ya existe y es la regla de ventas» | No es la misma pregunta. Aquel filtro exige «sin padre o padre `issued`» para poder **sumar un neto**, y `voidsParent()` deja `voided` al original justo en las anulaciones más frecuentes (motivos 01, 06, 02, 03): reutilizarlo **escondería del registro precisamente esas notas de crédito** (AC5), que son documentos reales que SUNAT ya tiene. Un registro lista documentos; un neto los compensa. Se escribe la condición propia y su test afirma que el SQL **no** contiene la disyunción del padre |
| **D-2**: CSV plano, sin dependencias | `.xlsx` con `exceljs`/`sheetjs`, o el TXT del PLE | Decisión de negocio cerrada (brainstorming §2): con el SIRE armando el registro oficial desde lo que el OSE ya reportó, el valor está en una tabla que el contador revisa y cruza, no en un formato rígido. El CSV abre directo en Excel y Sheets, es texto auditable a ojo y **no añade ninguna dependencia** a un proyecto que hoy no tiene ninguna de ofimática |
| **D-3**: El filtro de compras **compone** `buildExpenseFilters()` | Escribir `incurred_on >= … and <= …` a mano en el repositorio nuevo | Es la misma clase de reutilización que 026 y 027 hicieron con `buildDeclarableFilter()`: lo que se importa es la **definición del período** —los dos extremos inclusive sobre una columna `date`—, y una tercera copia se quedaría atrás en silencio el día que alguien la toque, haciendo que el registro y la card de gastos discrepen sobre qué día entra |
| **D-4**: UTF-8 **con BOM**, `\r\n`, coma como separador y punto decimal | UTF-8 sin BOM; `;` como separador | Sin BOM, Excel en Windows abre el archivo en la codificación del sistema y rompe tildes y ñ —el propio brainstorming lo dejó anotado como lo que había que resolver aquí (§8)—. El separador es la **coma** y no el punto y coma porque Perú usa el **punto** como separador decimal, y el separador de lista de una configuración regional con decimal `.` es la coma: un `;` sería la elección para España, no para es-PE. `\r\n` es lo que manda RFC 4180 y lo que ningún lector interpreta mal |
| **D-5**: El serializador neutraliza la inyección de fórmulas, y la excepción es «parece un número» | No hacer nada; o prefijar todos los campos con apóstrofo | La razón social del proveedor y el nombre del comprador los teclea una persona, y el archivo se abre en Excel: un campo que empieza por `=`, `+`, `-` o `@` es una fórmula ejecutable en la máquina del contador. Prefijar **todo** convertiría los importes en texto y rompería las sumas, que es justo para lo que el contador abre el archivo. El guard vive en **una sola función con test**, no repartido por cada celda |
| **D-6**: La descarga va por `axios` (blob) desde un service, con su hook | `<Button asChild><a href="/api/…" download>` | El ancla es más corta, pero con el atributo `download` el navegador **guarda igualmente el cuerpo de un error**: ante un 403 o un 500 el contador se queda con un `registro-ventas-….csv` que dentro tiene `{"message":"…"}`. Datos fiscales corruptos y silenciosos es peor que un toast. Pasar por el service respeta además la regla dura 2 de `docs/SETUP.md` —el HTTP vive en `services/`— y da estado de pendiente en el botón (AC22) |
| **D-7**: La exportación no pagina ni trunca | Reutilizar el endpoint paginado con `?pageSize=10000`, o cortar a N filas | Un registro contable truncado en silencio es un registro incorrecto, y con el tope del listado (100) haría falta que el cliente encadenara páginas y cosiera el CSV, duplicando la regla de composición en el navegador. El rango de fechas **es** el límite: el propio filtro acota el volumen, y §10 anota qué hacer el día que no alcance |
| **D-8**: La `comunicacion_baja` no es fila del registro | Listarla con celdas vacías en serie, base, IGV y total | No consume serie ni número propios ni lleva importes —lo garantizan dos `CHECK`—, así que no hay nada que cruzar contra el SIRE: sería una fila de guiones. El documento que sí cambia es su padre, que queda `voided` y por eso desaparece del registro (§10). El brainstorming enumera exactamente cuatro tipos (§3) |
| **D-9**: La lista de `kind` se **deriva** del catálogo (`NUMBERED_DOCUMENT_KINDS`) | Escribir `['boleta','factura','nota_credito','nota_debito']` en el repositorio | Es el patrón que ya siguen `ORIGINAL_DOCUMENT_KINDS` y `TAX_CREDIT_RECEIPT_TYPES`: la fuente de verdad es el catálogo puro y la exclusión se escribe **una vez**. Añadir mañana un `kind` con serie propia lo mete en el registro sin tocar este módulo (AC28), que es lo contrario de lo que haría una tupla copiada |
| **D-10**: El crédito fiscal **no** viaja en el contrato; se deriva con `grantsTaxCredit()` | Publicar `grantsTaxCredit: boolean` en la fila | Mismo criterio que 024 (AC16): la tabla de elegibilidad es un módulo puro que importan igual el CSV del servidor y la tabla del cliente, así que publicarla sería una segunda fuente de la misma regla, que además se congelaría en el JSON y quedaría desalineada el día que la tabla se corrija contra normativa |
| **D-11**: Orden **cronológico ascendente**, con desempate total | Descendente, como el listado de gastos (`finance.repository.ts:560`) | Un registro se lee como un libro: de la primera operación del período a la última, que es el orden en que el contador lo coteja contra el SIRE y el orden en que sale el CSV. Cambiarlo entre tabla y archivo sería peor todavía. El desempate (`series`/`number` o `created_at`/`id`) es lo que hace estable la paginación (AC13), misma precaución que 024 tomó en el listado de gastos |
| **D-12**: Repositorio propio `accounting.repository.ts` | Añadir las dos consultas a `finance.repository.ts` (640 líneas) | Aquel archivo es el de los **agregados** del módulo: sus constantes, su `toCents` y su alias existen para sumar. Estas dos son listados paginados de dos tablas distintas y comparten con él solo el vocabulario de rango, que se importa como tipo. Precedente exacto: `pricing.repository.ts`, que se separó por una razón equivalente (021, D-8). El import cruzado de `buildExpenseFilters` es deliberado (D-3) y el de `user.repository.ts` → `role.repository.ts` ya sienta el precedente |
| **D-13**: Cuatro rutas, dos por registro | Dos rutas con `?format=csv` | Una ruta que devuelve JSON o texto según un query param obliga a cada consumidor —y a cada lector del código— a decidir primero qué forma le va a llegar, y mezcla dos contratos de error en un mismo handler. Separadas, cada archivo tiene un `Content-Type` y una responsabilidad; lo que comparten —permiso, schema de rango, repositorio y serializador— se **importa**, que es lo único que valía la pena compartir |
| **D-14**: Las columnas del comprobante de compra se publican **nullables** aunque el `WHERE` las garantice | Estrecharlas con un guard que lance, o descartar la fila con `filter(Boolean)` | TypeScript no lee `CHECK`s de Postgres, así que hay tres salidas. Lanzar tumbaría el listado **y la exportación enteros** por una sola fila corrupta, justo cuando alguien intenta cerrar el mes; descartarla en silencio perdería una compra del registro, que es lo más grave que puede hacer esta pantalla. Publicar el nulo y pintarlo como celda vacía deja el hueco visible y el resto del período utilizable |
| **D-15**: Los importes del CSV son soles con dos decimales, sin símbolo ni miles; la tabla sigue usando `formatPrice` | Exportar `formatPrice(cents)` (`S/ 1,234.56`), o exportar los céntimos crudos | `S/ 1,234.56` llega a Excel como **texto** y no se puede sumar, que es lo primero que el contador hace con la columna. Los céntimos crudos obligarían a dividir a mano y a explicar la escala. `formatCsvAmount()` es aritmética entera —nunca `cents / 100` en coma flotante— y la pantalla conserva el formato con símbolo, que es lo correcto para leer, no para calcular |
| **D-16**: La fecha se deriva con `toReportingDayKey()` en las dos orillas; el contrato publica el ISO | Publicar ya el día `'YYYY-MM-DD'` resuelto por el servidor | El ISO es el dato crudo y no miente sobre el instante; el día de Lima es una presentación, y la regla vive en un módulo puro que importan igual el CSV del servidor y la tabla del cliente (mismo criterio que `grantsTaxCredit()`). Publicar solo el día descartaría información en el contrato para ahorrar una llamada a una función pura |
| **D-17**: Ninguna entrada en `audit_logs` por consultar o exportar | Registrar la exportación, «porque saca datos fiscales» | `audit_logs` es append-only **para mutaciones** (CLAUDE.md regla 11) y ninguna lectura del proyecto se audita hoy: empezar aquí instauraría un patrón nuevo sin que nadie lo haya pedido, y llenaría de entradas una tabla que `manager` y `audit` leen íntegra. La superficie ya está acotada por `finance.read` y por el `no-store` de la respuesta |

## 9. Tareas

Orden de dependencia: catálogo → schemas → tipos → repositorio → módulos puros →
handlers → service → estado cliente → vista → navegación → documentación → cierre.

- [x] **T1** — `NumberedDocumentKind` y `NUMBERED_DOCUMENT_KINDS` según §6.3,
      derivados del catálogo con el type-guard del `filter` · archivo:
      `src/lib/electronic-documents.ts` · verificación: `npm run typecheck`
- [x] **T2** — Tests de T1: excluye `comunicacion_baja`, conserva los otros cuatro,
      y su longitud es `ELECTRONIC_DOCUMENT_KINDS.length - 1` —así añadir un `kind`
      al catálogo rompe aquí si alguien lo excluye a mano— (AC28) · archivo:
      `src/lib/electronic-documents.test.ts` · verificación: `npm test`
- [x] **T3** — Exportar `dayKey`, `isOrderedRange` e `invertedRangeIssue` (hoy
      privados, `finance.schema.ts:32-46`), con el comentario de por qué ahora sí
      se extraen: tercer consumidor (CLAUDE.md §6). **Sin cambiar ninguna de las
      dos schemas existentes** · archivo:
      `src/modules/finance/schemas/finance.schema.ts` · verificación:
      `npm run typecheck && npm test`
- [x] **T4** — `accountingQuerySchema` según §6.1, importando las tres piezas de
      T3 · archivo: `src/modules/finance/schemas/accounting.schema.ts` ·
      verificación: `npm run typecheck`
- [x] **T5** — Tests de T4, al estilo de `finance.schema.test.ts`: los defaults
      (`page: 1`, `pageSize: 20`), el tope de `pageSize`, el rechazo del rango
      invertido con `path: ['from']`, y que **no** acepta `category` ni `search` ·
      archivo: `src/modules/finance/schemas/accounting.schema.test.ts` ·
      verificación: `npm test`
- [x] **T6** — Los tipos `SalesRegistryRow`, `PurchaseRegistryRow` y las dos
      respuestas según §6.2, con los comentarios de nullabilidad (D-14) · archivo:
      `src/modules/finance/types/accounting.types.ts` · verificación:
      `npm run typecheck`
- [x] **T7** — `buildSalesRegistryFilter()` y `findSalesRegistry()` según §6.4:
      `innerJoin` a `orders` por la PK, `leftJoin` al alias del padre, `inArray`
      sobre `NUMBERED_DOCUMENT_KINDS`, orden ascendente con desempate, conteo sin
      joins y sin conteo cuando `pagination === null` · archivo:
      `src/server/repositories/accounting.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T8** — Tests del SQL compilado de T7 con `PgDialect`, al estilo de
      `finance.repository.test.ts`: exige `"status" = $n` con `'issued'`, acota
      `"issued_at"` con `>=` y `<` (extremo superior **estricto**, AC6), filtra por
      los cuatro `kind`, **no** menciona la condición del padre de
      `buildDeclarableFilter` (AC4, D-1), y ordena ascendente por `"issued_at"` ·
      archivo: `src/server/repositories/accounting.repository.test.ts` ·
      verificación: `npm test`
- [x] **T9** — `buildPurchaseRegistryFilter()` y `findPurchaseRegistry()` según
      §6.4, componiendo `buildExpenseFilters()` importado con
      `isNotNull(expenses.receiptType)`, y derivando `baseCents` en el mapeo ·
      archivo: `src/server/repositories/accounting.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T10** — Tests del SQL compilado de T9: acota `"incurred_on"` con `>=` y
      `<=` —y **no** con `<`— (AC9), exige `"receipt_type" is not null`, no filtra
      por `"category"`, y ordena ascendente con los tres desempates · archivo:
      `src/server/repositories/accounting.repository.test.ts` · verificación:
      `npm test`
- [x] **T11** — Módulo puro `csv.ts` según §6.5: `CSV_BOM`, `toCsv()` con
      entrecomillado RFC 4180, `\r\n`, guard de fórmulas con excepción numérica, y
      `formatCsvAmount()` / `formatCsvAmountOrEmpty()` en aritmética entera ·
      archivo: `src/modules/finance/lib/csv.ts` · verificación: `npm run typecheck`
- [x] **T12** — Tests de T11, uno por comportamiento y con los casos raros que
      pide `.claude/skills/test-unit`: `0` → `0.00`; negativo → `-1234.56`; céntimo
      suelto (`5` → `0.05`); el negativo entre `-1` y `-99` (`-5` → `-0.05`, que es
      donde un `trunc` mal puesto pierde el signo); `null` → `''`; campo con coma,
      con comillas y con salto de línea; campo que empieza por `=`, `+`, `@`, TAB y
      CR → prefijado; importe negativo → **no** prefijado (AC16); cero filas → solo
      el BOM y la cabecera (AC23); la cadena empieza por `﻿` y usa `\r\n` ·
      archivo: `src/modules/finance/lib/csv.test.ts` · verificación: `npm test`
- [x] **T13** — Módulo puro `accounting-csv.ts` según §6.5: las dos cabeceras, las
      dos funciones de tabla y `registryFileName()` · archivo:
      `src/modules/finance/lib/accounting-csv.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — Tests de T13: el orden y el número de columnas coincide con las
      cabeceras; la fecha de ventas es el **día de Lima** de un `issued_at` de las
      22:00 del día 30 (AC18); una nota de crédito trae la serie-número del padre y
      un original la trae vacía (AC7); `grantsTaxCredit` decide el `Sí`/`No` de
      compras y una `factura` da `Sí` mientras una `boleta` da `No` (AC11); un
      comprobante sin serie deja la celda vacía; el nombre del archivo es
      `registro-ventas-2026-09-01_2026-09-30.csv` · archivo:
      `src/modules/finance/lib/accounting-csv.test.ts` · verificación: `npm test`
- [x] **T15** — Handler del listado de ventas: `authorize('finance.read')` antes
      de la query, `accountingQuerySchema`, `resolveFinanceRange` con un solo
      `new Date()`, y el `meta` de §6.2 · archivo:
      `src/app/api/admin/finance/accounting/sales/route.ts` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T16** — Handler de la exportación de ventas según §6.6: `financeRangeSchema`,
      `findSalesRegistry(range, null)` y las tres cabeceras (AC19, AC20, AC21) ·
      archivo: `src/app/api/admin/finance/accounting/sales/export/route.ts` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T17** — Handler del listado de compras, gemelo de T15 sobre
      `findPurchaseRegistry` · archivo:
      `src/app/api/admin/finance/accounting/purchases/route.ts` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T18** — Handler de la exportación de compras, gemelo de T16 ·
      archivo: `src/app/api/admin/finance/accounting/purchases/export/route.ts` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T19** — Service con las cuatro llamadas: las dos de listado devuelven su
      respuesta tipada; las dos de exportación usan `responseType: 'blob'` y
      devuelven `{ blob, filename }` con `registryFileName()`. Único punto del
      módulo que habla con la API · archivo:
      `src/modules/finance/services/accounting.service.ts` · verificación:
      `npm run typecheck`
- [x] **T20** — En `constants.ts`: `accountingKeys` (rama propia, no del resumen,
      con el rango y la paginación en la clave), `ACCOUNTING_PAGE_SIZE = 20`, los
      copys de estado vacío de cada pestaña, el de error de carga y el de error de
      exportación —que es un texto propio porque el cuerpo del fallo llega como
      `Blob` y el interceptor de axios no puede leer su `{ message }` (D-6)—, más
      la nota del encabezado que dice que esto **no es el PLE** · archivo:
      `src/modules/finance/constants.ts` · verificación: `npm run typecheck`
- [x] **T21** — Hooks de listado con `keepPreviousData` (AC24), uno por registro ·
      archivos: `src/modules/finance/hooks/use-sales-registry.ts`,
      `src/modules/finance/hooks/use-purchase-registry.ts` · verificación:
      `npm run typecheck`
- [x] **T22** — Hook de exportación: `useMutation` que llama al service, dispara la
      descarga con un `<a>` temporal sobre `URL.createObjectURL` y **revoca la URL**
      al terminar; `onError` muestra el toast con el copy de T20 y **no** descarga
      nada (AC22) · archivo: `src/modules/finance/hooks/use-registry-export.ts` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T23** — Columnas del Registro de Ventas con TanStack Table: fecha (día de
      Lima), tipo con `ELECTRONIC_DOCUMENT_KIND_LABELS`, serie-número, comprador
      (tipo + número + razón social), base, IGV, total y documento que modifica;
      los nulos como celda vacía con texto accesible, nunca «S/ 0.00» · archivo:
      `src/modules/finance/components/sales-registry-columns.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T24** — Columnas del Registro de Compras: fecha, proveedor (razón social +
      RUC), tipo con `PURCHASE_RECEIPT_TYPE_LABELS`, serie-número, base, IGV, total
      y un `Badge` de crédito fiscal derivado con `grantsTaxCredit()` (AC11) ·
      archivo: `src/modules/finance/components/purchase-registry-columns.tsx` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T25** — Tabla del Registro de Ventas: `useReactTable` con
      `manualPagination`, `DataTable` compartida, reinicio de página al cambiar el
      rango y estado vacío propio, al estilo de `expenses-table.tsx` · archivo:
      `src/modules/finance/components/sales-registry-table.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T26** — Tabla del Registro de Compras, gemela de T25 · archivo:
      `src/modules/finance/components/purchase-registry-table.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T27** — Botón «Exportar CSV» presentacional: recibe el registro y el rango,
      usa el hook de T22, se deshabilita mientras descarga y anuncia el estado con
      `aria-live` · archivo:
      `src/modules/finance/components/registry-export-button.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T28** — Contenedor con `FinanceRangeFilter` (mes en curso memoizado, como
      `finance-taxes-overview.tsx`) y las dos pestañas con `Tabs`, al estilo de
      `inventory-tabs.tsx`; cada pestaña monta su tabla y su botón de exportación ·
      archivo: `src/modules/finance/components/accounting-tabs.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T29** — Página server component: `requirePagePermission('finance.read')`
      (AC3), `metadata`, encabezado que dice qué es esto —un registro para revisar y
      cruzar contra el SIRE— y qué **no** es —el PLE oficial, ni una declaración— ·
      archivo: `src/app/(admin)/admin/finance/accounting/page.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T30** — Entrada «Contabilidad» en `NAV_ITEMS` detrás de «Impuestos», con
      `finance.read` y un icono no usado todavía (p. ej. `BookText`), con el
      comentario de por qué va ahí (AC25) · archivo:
      `src/app/(admin)/admin/layout.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T31** — Documentar en `docs/SETUP.md`: la cuarta pantalla del módulo
      financiero en §6, los cuatro endpoints, las decisiones del CSV (BOM,
      separador, guard de fórmulas) y **corregir la línea 1090**, que hoy deja la
      exportación del Registro de Ventas fuera de alcance · archivo:
      `docs/SETUP.md` · verificación: lectura
- [x] **T32** — Cierre: confirmar que `drizzle/` no ganó ninguna migración
      (AC26), que `src/lib/permissions.ts` sigue en 29 códigos (AC25) y que ningún
      componente importa `@/server/repositories` ni `axios` (AC27) · verificación:
      `npm run typecheck && npm run lint && npm test && npm run build`

## 10. Riesgos y consideraciones

- **La suma del registro no cuadrará con «Ventas declarables», y no es un error.**
  El registro lista cada documento `issued`; el agregado de 025/026 descarta las
  correcciones cuyo padre quedó `voided` y los originales anulados. El encabezado
  de la pantalla tiene que decirlo, igual que 025 tuvo que explicar por qué
  confirmadas y declarables no coinciden. Es la primera pregunta que hará quien
  compare las dos pantallas.
- **Un comprobante anulado desaparece del registro de su período, hacia atrás.**
  Si una nota de crédito de octubre deja `voided` un original de septiembre, el
  Registro de Ventas de septiembre **cambia al recargarlo**. Es consecuencia
  directa del modelo de 023 y ya está anotada en `docs/SETUP.md:1078-1084`. El PLE
  clásico resolvía esto listando el comprobante con estado «anulado» e importes en
  cero; aquí se decide no hacerlo (§11), porque el SIRE conserva su propia
  propuesta y esta pantalla es para cruzar contra ella, no para sustituirla.
- **El IGV de compras es una aproximación heredada.** `expenses.igv_cents` se
  calculó al guardar sobre un importe tecleado a mano, con la tabla de 024 que
  **sigue sin contrastarse contra normativa vigente** (`purchase-receipts.ts:19-35`).
  El registro lo publica tal cual, columna por columna, así que el error —si lo
  hay— es ahora más visible que en un agregado, que es preferible.
- **Volumen de la exportación.** El CSV no pagina (D-7): un rango de un año son
  todas las filas en memoria del handler y del navegador. Con el volumen actual
  —registro manual de gastos y emisión manual de comprobantes— son miles de filas
  como mucho, muy por debajo de cualquier límite. Si algún día un rango tarda o
  agota el tiempo de la función, la salida es **streaming** con `ReadableStream`
  sobre un cursor, no un tope que trunque.
- **Inyección de fórmulas.** Mitigada en el serializador (D-5), que es donde tiene
  que estar. Conviene no relajarla «porque afea un nombre con guion inicial»: el
  guard solo actúa sobre lo que no es un número.
- **El CSV no es la declaración.** El riesgo real de esta pantalla es de
  interpretación, no de código: alguien puede tomar el archivo por el Registro
  oficial. El copy del encabezado y el propio nombre del archivo tienen que
  sostener esa distinción, con el mismo criterio de avisos permanentes —no
  condicionales— que 026 fijó en D-13.
- **Filas con datos incompletos.** Un comprobante de compra registrado sin serie o
  un pedido sin razón social dejan celdas vacías. Es honesto y visible; lo que no
  se hace nunca es rellenarlas con `0.00` ni con un guion que parezca dato.

## 11. Fuera de alcance / deuda aceptada

- **Formato PLE / TXT de SUNAT.** Si SUNAT retrasa el SIRE para el régimen de esta
  empresa, se revisita este sub-proyecto: la pieza que cambiaría es
  `accounting-csv.ts`, porque las consultas y la pantalla ya producen las filas.
- **Los comprobantes anulados como fila con estado.** Requiere decidir qué estado
  se publica y cómo se cuenta el importe en cero; se retoma el día que el contador
  pida que el registro cuadre fila a fila contra la propuesta del SIRE.
- **`.xlsx`, totales al pie, filtros por tipo de documento, serie o proveedor,
  búsqueda y orden configurable.** Nada de eso se ha pedido; el rango es el único
  filtro, como en el resto del módulo.
- **Streaming de la exportación** (ver §10) y exportación programada o por correo.
- **Libro Diario, Libro Mayor y plan de cuentas**, que son un sub-proyecto propio.
- **Un módulo `csv` compartido en `src/lib/`.** Hoy tiene un solo dominio
  consumidor; se mueve a la tercera repetición, no antes (CLAUDE.md §6).
