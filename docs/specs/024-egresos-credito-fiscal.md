---
id: 024
title: Egresos v2 — crédito fiscal de compras
status: done
module: finance
scope: admin
created: 2026-09-22
---

# 024 — Egresos v2: crédito fiscal de compras

## 1. Contexto

`expenses` sabe **cuánto** se pagó y no sabe **a quién** ni **con qué
comprobante**. Verificado contra `src/server/db/schema/expense.ts`: la tabla
tiene exactamente ocho columnas —`id`, `concept`, `amount_cents`, `category`,
`incurred_on`, `created_by_id`, `created_at`, `updated_at`—, un índice
`expenses_incurred_on_idx` y un único `CHECK (amount_cents > 0)`. Sin RUC de
proveedor, sin tipo de comprobante y sin IGV. El propio spec 017 lo excluyó a
propósito: su §3 deja fuera «proveedores como entidad» e «impuestos, IGV,
retenciones y cualquier cálculo tributario».

El proyecto ya tiene resuelto el **otro** lado del IGV. El spec 022 emite boletas
y facturas de venta con su desglose `base_cents` / `igv_cents` en
`electronic_documents`, y para ello escribió dos piezas puras que este spec
reutiliza tal cual: `splitIgv()` en `src/modules/finance/lib/igv.ts` y
`isValidRuc()` en `src/modules/orders/lib/peru-document.ts` (módulo 11, cuatro
prefijos de contribuyente vigentes). Lo que falta es el lado de compras: sin
saber qué gasto llegó con factura, el sub-proyecto #4 (Impuestos) no tiene contra
qué restar el IGV de ventas que 022 ya produce.

Este es el **sub-proyecto #2 del roadmap de Finanzas**
(`docs/superpowers/specs/2026-09-21-modulo-finanzas-design.md`, §2), y su diseño
previo es `docs/superpowers/specs/2026-09-21-egresos-v2-design.md`. Los
sub-proyectos #0 (specs 022 y 023) y #1 (spec 021) están `done`; este es
independiente de los dos y no los modifica.

## 2. Objetivo

Quien registra un gasto puede declarar el comprobante con el que llegó —tipo,
RUC y razón social del proveedor, serie y número—, el servidor calcula y guarda
el IGV contenido en el importe, y `/admin/finance` muestra cuánto IGV de compras
del período da derecho a crédito fiscal y cuánto no.

## 3. Alcance

### Incluye

- Enum nuevo de Postgres `purchase_receipt_type` (`factura`, `boleta`,
  `recibo_honorarios`, `otro`), construido desde un catálogo puro en
  `src/lib/purchase-receipts.ts`.
- Seis columnas nuevas en `expenses`, todas nullable: `receipt_type`,
  `supplier_ruc`, `supplier_name`, `receipt_series`, `receipt_number` e
  `igv_cents`.
- Cuatro `CHECK` nuevos que hacen que el comprobante sea **todo o nada** en la
  base, no solo en Zod (§5.2).
- Migración Drizzle `0012` (verificado: el último journal es `0011_icy_maggott`).
- Cálculo del IGV **en el servidor**, con el `splitIgv()` del spec 022, tanto en
  el alta como en la edición; nunca lo teclea ni lo envía el cliente.
- Tabla de reglas por tipo de comprobante —si es afecto a IGV y si otorga
  derecho a crédito fiscal— en una sola función pura, no en condicionales
  repartidos (§5.1, D-4).
- Validación offline del RUC del proveedor por dígito verificador, reutilizando
  `isValidRuc()` del spec 022 sin escribir un segundo verificador.
- Card nueva «IGV de compras» en `/admin/finance`, con el mismo filtro de rango
  que el resto del módulo, separando lo que da crédito fiscal de lo que no.
- Comprobante y proveedor visibles en la tabla de gastos, e IGV junto al importe.
- Interruptor «¿Tiene comprobante?» en el formulario de gasto, que despliega los
  campos del comprobante y los retira al apagarlo.

### No incluye (explícito)

- **Catálogo de proveedores.** Decidido en el diseño (§2): RUC y razón social en
  texto libre por gasto, mismo criterio que `concept`.
- **Validación en línea del RUC** contra el padrón de SUNAT. La comprobación es
  aritmética y offline: dice que el número no está tecleado al azar, no que
  exista.
- **Adjuntar el PDF o la foto del comprobante.** Sigue fuera, como en 017: el
  proyecto no tiene almacenamiento de archivos.
- **El cálculo de «IGV por pagar».** Este spec aporta el lado de compras; restar
  débito contra crédito es el sub-proyecto #4 (Impuestos).
- **Retroactividad.** Los gastos ya registrados quedan con `receipt_type = null`.
  No se puede inventar si tuvieron factura.
- **Detracciones, retenciones, percepciones y operaciones no gravadas
  declaradas aparte.**
- **Tasas de IGV distintas del 18 %, exoneraciones e inafectaciones por
  producto.** El importe se trata como IGV incluido al 18 % cuando el tipo de
  comprobante es afecto (§5.3, D-5).
- **Ningún permiso nuevo.** El catálogo se queda en 29 códigos (verificado en
  `src/lib/permissions.ts`).
- **Filtro «solo gastos con comprobante»** ni búsqueda por RUC en la tabla: el
  único filtro sigue siendo la categoría (D-15).
- **Cambios en `netCents`, `marginPercent` ni en el desglose por categoría.** El
  resultado del período sigue diciendo exactamente lo que dice hoy: el IGV es un
  dato al lado, no un sumando nuevo.
- Gráficos y exportación, mismo criterio que 017 (D-13) y 021.

## 4. Criterios de aceptación

- [ ] AC1 — Dado un visitante sin sesión, cuando pide cualquiera de los tres
      endpoints tocados, entonces recibe `401` con cuerpo `{ message }` y no un
      `307` al formulario de Clerk.
- [ ] AC2 — Dado un usuario con sesión y sin `finance.read`, cuando pide
      `GET /api/admin/expenses?page=abc`, entonces recibe `403` y no `400`.
- [ ] AC3 — Dado un `POST /api/admin/expenses` sin `receipt` (o con
      `receipt: null`), entonces se registra el gasto con las seis columnas
      nuevas en `null` y la respuesta es `201`: un gasto sin comprobante se
      registra exactamente igual que antes de este spec.
- [ ] AC4 — Dado un `receipt` cuyo `supplierRuc` no pasa el dígito verificador
      —por ejemplo `20123456789` con el último dígito cambiado, o un `11…` cuyo
      prefijo no es de contribuyente—, entonces la respuesta es `400` con
      `issues` y no se inserta ninguna fila.
- [ ] AC5 — Dado un `receipt` al que le falta `type`, `supplierRuc` o
      `supplierName`, entonces la respuesta es `400`: el comprobante viaja
      completo o no viaja.
- [ ] AC6 — Dado un `receipt` de un tipo **afecto a IGV** y un `amountCents` de
      `11800`, entonces la fila queda con `igv_cents = 1800` y se cumple
      `amount_cents − igv_cents = round(amount_cents / 1.18)` por construcción,
      no por suerte del redondeo.
- [ ] AC7 — Dado un cuerpo que incluye `igvCents` o `receipt.igvCents`, entonces
      el valor se descarta y el IGV guardado es el calculado por el servidor: no
      hay ningún camino en el que el cliente fije el impuesto.
- [ ] AC8 — Dado un `receipt` de un tipo **no afecto a IGV** según la tabla de
      §5.1, entonces el gasto se registra con su proveedor y su serie-número pero
      con `igv_cents = null`; nunca con `0`, que significaría «un IGV de cero».
- [ ] AC9 — Dado un gasto con comprobante afecto y un `PATCH` que cambia **solo**
      `amountCents`, entonces `igv_cents` se recalcula sobre el importe nuevo: no
      queda el IGV del importe anterior.
- [ ] AC10 — Dado un `PATCH` con `receipt: null` sobre un gasto que sí tenía
      comprobante, entonces las seis columnas quedan en `null` en la misma
      operación, y la bitácora guarda el estado anterior completo.
- [ ] AC11 — Dado un `PATCH` que **omite** `receipt`, entonces el comprobante
      queda intacto: omitir no es borrar.
- [ ] AC12 — Dado un `receipt` con `series` y sin `number` (o al revés), entonces
      la respuesta es `400`; dado uno sin ninguno de los dos, se acepta.
- [ ] AC13 — Dado un `INSERT` o `UPDATE` hecho fuera de la aplicación —seed,
      migración de datos o `psql`— que deje `receipt_type` con valor y
      `supplier_ruc` en `null`, o `igv_cents` con valor y `receipt_type` en
      `null`, o `igv_cents >= amount_cents`, entonces la base lo rechaza por
      `CHECK`.
- [ ] AC14 — Dado un rango con gastos de varios tipos de comprobante, entonces la
      card «IGV de compras» muestra como cifra principal **solo** la suma de los
      que otorgan crédito fiscal, y publica aparte —con su propia etiqueta— la
      suma de los que no. Los dos números nunca se presentan sumados.
- [ ] AC15 — Dado un rango sin ningún gasto con comprobante, entonces la card
      muestra `S/ 0.00` con su copy de estado vacío. No es un error ni un estado
      de carga.
- [ ] AC16 — Dada la regla de elegibilidad, entonces vive en un único sitio
      (`src/lib/purchase-receipts.ts`) y tanto el SQL del agregado como la vista
      la consumen de ahí: no hay ningún `=== 'factura'` suelto en el código.
- [ ] AC17 — Dado un filtro de categoría aplicado en la tabla, entonces los
      importes de IGV del resumen **no** cambian, igual que el resto de los KPI
      (017, D-17).
- [ ] AC18 — Dado el formulario con el interruptor «¿Tiene comprobante?» apagado,
      entonces los campos del comprobante no se muestran y **nada de lo que se
      hubiera tecleado en ellos viaja en el cuerpo**.
- [ ] AC19 — Dada la tabla de gastos, entonces cada fila con comprobante muestra
      su tipo, su serie-número y su IGV, y cada fila sin comprobante muestra un
      guion con texto accesible, nunca `S/ 0.00` ni una celda en blanco.
- [ ] AC20 — Dado un alta o una edición, entonces `audit_logs` registra las
      columnas nuevas dentro de `changes` en la misma transacción, igual que el
      resto de la fila, **salvo `supplier_ruc`**, que se proyecta fuera con
      `toAuditableExpense()`: la bitácora la leen `manager` y `audit` sin
      `finance.read`, y un RUC `10…` lleva el DNI embebido (§10).
- [ ] AC21 — Dados los gastos registrados antes de la migración, entonces el
      listado y el resumen los siguen devolviendo con `receipt: null` y sin
      error: no hay backfill y no hace falta ninguno.
- [ ] AC22 — Dado cualquier importe del JSON de cualquiera de los endpoints
      tocados —incluidos los de IGV—, entonces es un entero en céntimos; la
      división por 100 solo ocurre en el formateo de la vista.

## 5. Modelo de datos

**Requiere migración.** Añade un enum y seis columnas a una tabla existente. La
migración generada será `drizzle/0012_*.sql` (verificado: el journal termina en
`0011_icy_maggott`).

### 5.1 Punto pendiente de verificación — elegibilidad para crédito fiscal

> **No he podido verificar esta regla contra la normativa SUNAT vigente desde mi
> sesión: no tengo acceso a la web ni a ninguna fuente normativa.** Se registra
> aquí explícitamente, igual que el spec 022 §10 registró la ventana de la
> comunicación de baja y el spec 023 la resolvió en su T1 bloqueante, en vez de
> asumirla en silencio.

El documento de diseño (§5) propone que `factura` y `recibo_honorarios` otorgan
crédito fiscal y que `boleta` y `otro` no. **Mi lectura de la norma no coincide
en `recibo_honorarios`**: el recibo por honorarios documenta rentas de cuarta
categoría —servicios de una persona natural independiente— y no es un
comprobante afecto a IGV, así que no hay IGV que tomar como crédito y tampoco
hay un 18 % contenido que calcular. Si eso es correcto, el diseño acierta al
excluir la boleta pero se equivoca al incluir el recibo por honorarios, y además
el cálculo automático del 18 % sobre ese tipo guardaría un número que no existe.

Por eso la regla se modela como **una tabla de dos columnas por tipo** y no como
una lista de elegibles, y los valores de arranque son los conservadores:
subdeclarar crédito fiscal es un error recuperable, sobredeclararlo es una
infracción.

| Tipo | `carriesIgv` (se calcula `igv_cents`) | `grantsTaxCredit` (suma en la card) |
|---|---|---|
| `factura` | sí | sí |
| `boleta` | sí | **no** — regla general; pendiente de T1 |
| `recibo_honorarios` | **no** — pendiente de T1 | no |
| `otro` | no | no |

**T1 es bloqueante y puede cambiar cualquier celda de esta tabla.** Cambiarla es
editar un objeto literal con su test: ninguna otra pieza del spec depende de los
valores concretos, solo de que la tabla exista. Es el mismo mecanismo que el
D-12 del spec 023.

#### 5.1.1 Resultado de T1 (2026-09-22) — **sigue sin verificar contra fuente**

La sesión de implementación **tampoco tuvo acceso a la web ni a ninguna fuente
normativa**: no hay herramienta de búsqueda ni de fetch habilitada, así que no se
pudo abrir el TUO de la Ley del IGV, el Reglamento de Comprobantes de Pago ni
ninguna resolución de SUNAT. T1 se cierra por la vía que el propio enunciado
prevé —«si no se consigue confirmar, dejarlo escrito como tal y conservar los
valores conservadores»— y **no** por la vía de dar la regla por buena.

Lo único que se aporta es la lectura razonada que ya estaba en esta sección, sin
cita y por tanto sin valor probatorio:

- `recibo_honorarios` documenta rentas de **cuarta categoría** y no es un
  comprobante afecto a IGV. Por eso queda con `carriesIgv: false`: calcularle un
  18 % guardaría un número que no existe (D-5).
- `boleta` sí es un comprobante afecto —lleva IGV incluido en el precio— pero la
  regla general es que **no sustenta crédito fiscal**. Existen regímenes
  especiales que admiten un porcentaje parcial, y es justamente lo que no se ha
  podido contrastar. Se mantiene `grantsTaxCredit: false`.
- `otro` es un cajón sin comprobante identificado: no se le calcula IGV ni se le
  reconoce crédito.

**Ninguna celda de la tabla cambia.** Los cuatro tipos se implementan con los
valores conservadores de §5.1 tal cual. Quien tenga acceso a la normativa debe
revisar esta tabla antes de que el sub-proyecto #4 (Impuestos) consuma
`purchaseIgv.creditableCents`: hasta entonces el sistema **subdeclara** crédito
fiscal, que es el sentido del error elegido a propósito. El efecto colateral de
corregirla después está anotado en §10: `igv_cents` se calculó al guardar, así
que abrir la afectación de un tipo exige un recálculo explícito sobre las filas
ya registradas.

Consecuencia para el usuario al aprobar: **este spec propone calcular
`igv_cents` solo en los tipos afectos**, lo que es más estrecho que el §5 del
documento de brainstorming («los demás se calculan igual, por transparencia»).
La razón está en D-5; es el único punto en el que este spec se aparta de la letra
del diseño aprobado y se señala aquí para que se confirme o se rechace en la
aprobación.

### 5.2 `expenses` — columnas nuevas

| Columna | Tipo | Nota |
|---|---|---|
| `receipt_type` | `purchase_receipt_type`, nullable | `null` = gasto sin comprobante formal. Es el discriminador de todo lo demás |
| `supplier_ruc` | `varchar(11)`, nullable | Obligatorio cuando hay comprobante. Dígito verificador en Zod; forma en el `CHECK` |
| `supplier_name` | `varchar(160)`, nullable | Razón social, texto libre. Mismo ancho que `concept` |
| `receipt_series` | `varchar(4)`, nullable | `F001`, `B001`, `E001`… Opcional incluso con comprobante |
| `receipt_number` | `varchar(20)`, nullable | Correlativo **como cadena**: conserva los ceros a la izquierda impresos |
| `igv_cents` | `integer`, nullable | Lo calcula el servidor. `null` = sin comprobante o comprobante no afecto |

Sin índice nuevo (D-13). Sin `unique`: dos facturas distintas pueden compartir
serie y número si son de proveedores distintos, y el proyecto no tiene forma de
afirmar lo contrario sin un padrón; ningún endpoint de este spec devuelve `409`.

```ts
// src/server/db/schema/expense.ts — firma propuesta (solo lo que cambia)
import { PURCHASE_RECEIPT_TYPES } from '@/lib/purchase-receipts';

// Los valores salen del catálogo puro y no de una tupla repetida aquí. Es el patrón
// del spec 022 (`electronic-documents.ts`) y corrige de paso el riesgo que el propio
// spec 017 anotó sobre `EXPENSE_CATEGORIES`: dos listas que deben decir lo mismo.
export const purchaseReceiptType = pgEnum('purchase_receipt_type', PURCHASE_RECEIPT_TYPES);

export const expenses = pgTable(
  'expenses',
  {
    // … las ocho columnas actuales, sin tocar …

    // `null` = gasto sin comprobante formal, que es el caso de todo lo registrado
    // hasta este spec. Discrimina las cinco columnas siguientes.
    receiptType: purchaseReceiptType('receipt_type'),
    supplierRuc: varchar('supplier_ruc', { length: 11 }),
    supplierName: varchar('supplier_name', { length: 160 }),
    receiptSeries: varchar('receipt_series', { length: 4 }),
    // Cadena y no entero: el correlativo se imprime con ceros a la izquierda y
    // `00001234` no es `1234` cuando hay que cotejarlo con el papel.
    receiptNumber: varchar('receipt_number', { length: 20 }),
    // Lo escribe el servidor con `splitIgv()`; ningún schema de entrada lo acepta
    // (AC7). `null` y no `0`: cero significaría «un IGV de cero», que es otra cosa.
    igvCents: integer('igv_cents'),
  },
  (t) => [
    // … el índice y el CHECK de importe actuales, sin tocar …

    // El comprobante es todo o nada: no existe un RUC sin tipo ni un tipo sin RUC.
    // En Zod y además aquí, por lo mismo que el CHECK de importe del spec 017 (D-6):
    // un seed o un `psql` a mano no pasan por Zod.
    check(
      'expenses_receipt_all_or_nothing',
      sql`(${t.receiptType} is null) = (${t.supplierRuc} is null)
          and (${t.receiptType} is null) = (${t.supplierName} is null)`,
    ),
    // Forma del RUC, no su dígito verificador: el módulo 11 no cabe en un CHECK sin
    // crear una función en la base, y esa comprobación ya vive en `isValidRuc()`.
    check('expenses_supplier_ruc_format', sql`${t.supplierRuc} ~ '^[0-9]{11}$'`),
    // Serie y número viajan juntos, y solo con comprobante.
    check(
      'expenses_receipt_series_number_pair',
      sql`(${t.receiptSeries} is null) = (${t.receiptNumber} is null)
          and (${t.receiptType} is not null or ${t.receiptSeries} is null)`,
    ),
    // No hay IGV sin comprobante, y el IGV contenido en un importe nunca llega a ser
    // el importe: con el 18 % incluido son ~15,25 % del total. Un `igv_cents` igual o
    // mayor que `amount_cents` es un dato corrupto, y el sub-proyecto #4 lo restaría
    // del IGV de ventas sin saberlo.
    check(
      'expenses_igv_within_amount',
      sql`${t.igvCents} is null
          or (${t.receiptType} is not null
              and ${t.igvCents} >= 0
              and ${t.igvCents} < ${t.amountCents})`,
    ),
  ],
);
```

`src/server/db/schema/index.ts` exporta además `purchaseReceiptType`.

Nota sobre `expenses_supplier_ruc_format`: en Postgres un `CHECK` se satisface
cuando la expresión es `NULL`, así que la forma `columna ~ patrón` ya deja pasar
el `null` sin necesidad de un `is null or` delante. Es deliberado y está escrito
aquí para que en la revisión del SQL generado no parezca un olvido.

### 5.3 Catálogo puro — `src/lib/purchase-receipts.ts`

```ts
// Catálogo de comprobantes de compra. Módulo puro —sin Drizzle, sin Zod y sin React—
// con el mismo reparto que `electronic-documents.ts`: la fuente de verdad vive aquí y
// el esquema construye su `pgEnum` a partir de esta tupla (docs/SETUP.md §4, regla 5).
//
// Que esté aquí es lo que permite que el repositorio construya el WHERE del agregado y
// que un componente cliente pinte la etiqueta, sin que ninguno arrastre al otro.

export const PURCHASE_RECEIPT_TYPES = [
  'factura',
  'boleta',
  'recibo_honorarios',
  'otro',
] as const;

export type PurchaseReceiptType = (typeof PURCHASE_RECEIPT_TYPES)[number];

/**
 * Las dos reglas tributarias del tipo de comprobante, juntas y en forma de tabla.
 *
 * `carriesIgv`  — si el importe lleva IGV incluido al 18 % y por tanto se desglosa.
 * `grantsTaxCredit` — si ese IGV da derecho a crédito fiscal al comprador con RUC.
 *
 * **Valores pendientes de T1** (spec 024, §5.1): no se han podido contrastar contra la
 * normativa vigente y los de arranque son los conservadores. Subdeclarar crédito fiscal
 * se corrige; sobredeclararlo es una infracción. Cambiar una celda es editar este objeto
 * y su test: ninguna otra pieza depende de los valores concretos.
 */
export const PURCHASE_RECEIPT_RULES: Record<
  PurchaseReceiptType,
  { carriesIgv: boolean; grantsTaxCredit: boolean }
> = {
  factura: { carriesIgv: true, grantsTaxCredit: true },
  boleta: { carriesIgv: true, grantsTaxCredit: false },
  recibo_honorarios: { carriesIgv: false, grantsTaxCredit: false },
  otro: { carriesIgv: false, grantsTaxCredit: false },
};

export function carriesIgv(type: PurchaseReceiptType): boolean {
  return PURCHASE_RECEIPT_RULES[type].carriesIgv;
}

export function grantsTaxCredit(type: PurchaseReceiptType): boolean {
  return PURCHASE_RECEIPT_RULES[type].grantsTaxCredit;
}

/**
 * Los tipos elegibles, derivados de la tabla y no escritos a mano. Lo consume el
 * `inArray` del agregado del repositorio: así el SQL y la vista no pueden discrepar
 * sobre qué cuenta como crédito fiscal (AC16).
 */
export const TAX_CREDIT_RECEIPT_TYPES = PURCHASE_RECEIPT_TYPES.filter(grantsTaxCredit);

export const PURCHASE_RECEIPT_TYPE_LABELS: Record<PurchaseReceiptType, string> = {
  factura: 'Factura',
  boleta: 'Boleta de venta',
  recibo_honorarios: 'Recibo por honorarios',
  otro: 'Otro comprobante',
};
```

### 5.4 Reglas de cálculo (normativas)

**IGV contenido.** Se reutiliza `splitIgv()` de
`src/modules/finance/lib/igv.ts` (spec 022), que ya implementa exactamente la
fórmula del diseño:

```
base = round(amount_cents / 1.18)
igv  = amount_cents − base          →  base + igv === amount_cents por construcción
```

No se escribe una segunda fórmula. `splitIgv()` lanza con un importe que no sea
entero positivo, condición que `createExpenseSchema` ya garantiza antes.

Se calcula **si y solo si** hay comprobante y su tipo es afecto según §5.1. En
cualquier otro caso `igv_cents` es `null`.

**Agregado del período.** Sobre el mismo rango de días inclusivo que ya usa el
módulo:

```
igvCreditableCents = sum(igv_cents) filter (where receipt_type in TAX_CREDIT_RECEIPT_TYPES)
igvCreditableCount = count(*)       filter (where igv_cents is not null and receipt_type in TAX_CREDIT_RECEIPT_TYPES)
igvTotalCents      = sum(igv_cents)
igvCount           = count(*)       filter (where igv_cents is not null)
```

Y el handler deriva por resta entera, que no puede divergir de la suma:

```
nonCreditableCents = igvTotalCents − igvCreditableCents
nonCreditableCount = igvCount      − igvCreditableCount
```

Sin filtro de categoría, igual que el resto del resumen (AC17).

## 6. Contratos de API

Ninguna ruta nueva: los tres endpoints existentes cambian de forma, no de
dirección.

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/finance/summary` | `finance.read` | query: `from?`, `to?` | `FinanceSummaryResponse` **+ `data.purchaseIgv`** | 400, 401, 403, 500 |
| GET | `/api/admin/expenses` | `finance.read` | query: sin cambios | `ExpenseListResponse` con **`data[].receipt`** | 400, 401, 403, 500 |
| POST | `/api/admin/expenses` | `expenses.create` | body: `CreateExpenseInput` **+ `receipt`** | `ExpenseMutated` (201) | 400, 401, 403, 500 |
| PATCH | `/api/admin/expenses/[id]` | `expenses.update` | body: `UpdateExpenseInput` **+ `receipt`** | `ExpenseMutated` | 400, 401, 403, 404, 500 |
| DELETE | `/api/admin/expenses/[id]` | `expenses.delete` | — | `ExpenseMutated` | sin cambios |

`ExpenseMutated` **no** gana el comprobante: solo alimenta el toast y la
invalidación, y ampliarlo sería publicar un RUC en una respuesta que nadie lee
(§10).

### 6.1 Zod — `src/modules/finance/schemas/finance.schema.ts`

```ts
import { PURCHASE_RECEIPT_TYPES } from '@/lib/purchase-receipts';
import { isValidRuc } from '@/modules/orders/lib/peru-document';

// Serie tal y como se imprime: hasta 4 caracteres alfanuméricos en mayúscula (`F001`,
// `E001`, `B002`). No se valida contra ningún padrón: es lo que dice el papel.
const RECEIPT_SERIES_PATTERN = /^[A-Z0-9]{1,4}$/;
// Correlativo como cadena: `00001234` conserva los ceros con los que está impreso.
const RECEIPT_NUMBER_PATTERN = /^[0-9]{1,20}$/;

// Objeto anidado y no cinco campos planos (D-6): «todo o nada» es representable en el
// tipo, y en el PATCH `receipt: null` significa «quítalo» sin ambigüedad frente a
// «no lo mando».
export const purchaseReceiptSchema = z
  .object({
    type: z.enum(PURCHASE_RECEIPT_TYPES),
    // Dígito verificador por módulo 11, reutilizado del spec 022 (D-11). Comprueba que
    // el número no está tecleado al azar; no comprueba que el proveedor exista.
    supplierRuc: z
      .string()
      .trim()
      .refine(isValidRuc, 'El RUC del proveedor no es válido'),
    supplierName: z.string().trim().min(3).max(160),
    series: z.string().trim().toUpperCase().regex(RECEIPT_SERIES_PATTERN).optional(),
    number: z.string().trim().regex(RECEIPT_NUMBER_PATTERN).optional(),
  })
  // Los dos o ninguno: media referencia no identifica el documento (AC12).
  .refine((v) => (v.series === undefined) === (v.number === undefined), {
    message: 'La serie y el número del comprobante van juntos.',
    path: ['number'],
  });

export const createExpenseSchema = z.object({
  // … concept, amountCents, category, incurredOn: sin cambios …

  // `null` explícito y `default(null)`: el alta sin comprobante puede omitirlo y el
  // resto del código recibe siempre `PurchaseReceiptInput | null`, nunca `undefined`.
  //
  // `igvCents` no aparece por ningún lado y eso es la garantía de AC7: Zod descarta lo
  // que no declara, así que no existe un cuerpo capaz de fijar el impuesto.
  receipt: purchaseReceiptSchema.nullable().default(null),
});

// `.partial()` deja `receipt` en `PurchaseReceiptInput | null | undefined`, que son
// exactamente las tres semánticas del PATCH: cambiarlo, quitarlo (AC10) o no tocarlo
// (AC11).
export const updateExpenseSchema = createExpenseSchema.partial().refine(/* sin cambios */);

export type PurchaseReceiptInput = z.output<typeof purchaseReceiptSchema>;
```

**Corrección durante la implementación (T8).** El comentario de arriba sobre
`.partial()` **no se cumple en Zod 4** y se comprobó ejecutándolo: `.partial()`
envuelve el campo en `optional` pero **el `default(null)` sigue rellenando la
clave ausente**. Con la forma literal del spec, `updateExpenseSchema.parse({
amountCents: 500 })` devolvía `{ amountCents: 500, receipt: null }` —es decir,
«borra el comprobante» en cada `PATCH` que lo omite, rompiendo AC11— y
`safeParse({})` pasaba a `success: true`, porque la clave rellenada hacía que el
`refine` de «cuerpo vacío» viera una clave y dejara de disparar: una regresión
sobre el comportamiento del spec 017.

Se implementa **la intención declarada** —las tres semánticas: valor, `null`,
ausente— con el mecanismo que sí la produce, redeclarando el campo sin default
en el schema del PATCH:

```ts
export const updateExpenseSchema = createExpenseSchema
  .partial()
  .extend({ receipt: purchaseReceiptSchema.nullable().optional() })
  .refine((value) => Object.keys(value).length > 0, { … });
```

Las dos propiedades quedan fijadas con tests en T9 (`'receipt' in parsed` es
`false` al omitirlo, y `{}` sigue siendo cuerpo vacío).

### 6.2 Zod del formulario — `src/modules/finance/schemas/expense-form.schema.ts`

Plano y con `superRefine`, siguiendo el precedente de
`inventory-document.schema.ts` (spec 021): los campos condicionales se exigen
según una bandera y el error cuelga del campo concreto.

```ts
export const expenseFormSchema = z
  .object({
    // … concept, amount, category, incurredOn: sin cambios …
    hasReceipt: z.boolean(),
    receiptType: z.enum(PURCHASE_RECEIPT_TYPES),
    supplierRuc: z.string().trim(),
    supplierName: z.string().trim(),
    receiptSeries: z.string().trim(),
    receiptNumber: z.string().trim(),
  })
  // `superRefine` y no `refine`: cada error tiene que colgar de su campo para que el
  // formulario lo pinte donde está, no en la raíz.
  .superRefine((value, ctx) => {
    if (!value.hasReceipt) return;
    if (!isValidRuc(value.supplierRuc)) {
      ctx.addIssue({ code: 'custom', path: ['supplierRuc'], message: 'El RUC no es válido' });
    }
    // … razón social mínima, par serie-número …
  });
```

El diálogo **no** envía estos campos tal cual: construye `receipt` cuando
`hasReceipt` es `true` y `null` cuando es `false`, así que lo tecleado y luego
descartado no viaja (AC18) aunque React Hook Form conserve el valor en su
registro.

### 6.3 Tipos de salida — `src/modules/finance/types/finance.types.ts`

```ts
import type { PurchaseReceiptType } from '@/lib/purchase-receipts';

export type ExpenseReceipt = {
  type: PurchaseReceiptType;
  supplierRuc: string;
  supplierName: string;
  series: string | null;
  number: string | null;
  /** `null` cuando el tipo no es afecto a IGV (§5.1). Nunca `0`. */
  igvCents: number | null;
};

// `null` = gasto sin comprobante. La fila completa y no seis campos sueltos: el
// componente hace una comprobación, no seis.
export type ExpenseRow = /* lo de hoy */ & { receipt: ExpenseReceipt | null };

export type PurchaseIgvTotals = {
  /** Suma del IGV de los comprobantes que otorgan crédito fiscal. */
  creditableCents: number;
  creditableCount: number;
  /** El resto del IGV calculado del período. Se publica, nunca se suma al anterior (AC14). */
  nonCreditableCents: number;
  nonCreditableCount: number;
};

export type FinanceSummary = /* lo de hoy */ & { purchaseIgv: PurchaseIgvTotals };
```

`ExpenseRow` **no** publica si el comprobante otorga crédito fiscal: es
derivable de `type` con `grantsTaxCredit()`, que es un módulo puro que el cliente
puede importar. Publicarlo sería una segunda fuente de la misma regla (AC16).

## 7. Arquitectura y archivos afectados

- `src/lib/purchase-receipts.ts` + `.test.ts` — **nuevo**: catálogo puro, tabla
  de reglas, derivados y etiquetas (§5.3).
- `src/server/db/schema/expense.ts` — enum `purchase_receipt_type`, seis
  columnas y cuatro `CHECK`.
- `src/server/db/schema/index.ts` — exporta `purchaseReceiptType`.
- `drizzle/0012_*.sql` — **nuevo**: migración generada.
- `src/modules/finance/lib/expense-receipt.ts` + `.test.ts` — **nuevo**:
  `toReceiptColumns()` y `resolveReceiptColumns()`, las dos piezas puras que
  traducen el `receipt` del contrato a las seis columnas y calculan el IGV.
- `src/modules/finance/lib/expense-audit.ts` + `.test.ts` — **nuevo, añadido en
  revisión**: `toAuditableExpense()`, la proyección positiva que deja
  `supplier_ruc` fuera de `changes` en los tres `logAudit()` (§10). No estaba
  previsto al redactar el spec; se añade por el mismo motivo y con el mismo patrón
  que el `product-audit.ts` del spec 021.
- `src/modules/finance/lib/igv.ts` — **sin cambios**: se importa `splitIgv()`.
- `src/modules/orders/lib/peru-document.ts` — **sin cambios**: se importa
  `isValidRuc()` (D-11).
- `src/modules/finance/schemas/finance.schema.ts` + `.test.ts` —
  `purchaseReceiptSchema` y el campo `receipt`.
- `src/modules/finance/schemas/expense-form.schema.ts` + `.test.ts` — los seis
  campos del formulario y su `superRefine`.
- `src/modules/finance/types/finance.types.ts` — `ExpenseReceipt`,
  `PurchaseIgvTotals` y los dos tipos ampliados.
- `src/modules/finance/constants.ts` — copys de la card y del formulario.
- `src/server/repositories/finance.repository.ts` + `.test.ts` — proyección del
  comprobante en `findManyExpenses()` y los cuatro agregados de IGV en
  `findExpenseTotals()`.
- `src/app/api/admin/expenses/route.ts` — el `POST` construye las columnas.
- `src/app/api/admin/expenses/[id]/route.ts` — el `PATCH` recalcula sobre el
  estado fusionado.
- `src/app/api/admin/finance/summary/route.ts` — deriva `purchaseIgv` y lo
  publica.
- `src/modules/finance/components/finance-summary-cards.tsx` — card «IGV de
  compras».
- `src/modules/finance/components/expense-columns.tsx` — columna «Comprobante»,
  proveedor bajo el concepto e IGV bajo el importe.
- `src/modules/finance/components/expense-form-dialog.tsx` — interruptor y
  campos del comprobante.
- `src/app/(admin)/admin/finance/page.tsx` — una línea en el encabezado: el IGV
  de compras es un dato informativo, no entra en el resultado.
- `docs/SETUP.md` — §5.3 (columnas y enum nuevos, migración `0012`) y §6
  (módulo financiero).

**Sin cambios**, y conviene que quede escrito para que no se toquen: el service
(`finance.service.ts`) y los tres hooks. Sus firmas se tipan con
`CreateExpenseInput` / `UpdateExpenseInput` / `ExpenseListResponse`, así que el
campo nuevo viaja solo en cuanto cambian los schemas y los tipos. Tampoco cambian
`finance-math.ts`, `finance-range.ts`, `expenses-by-category.tsx`,
`expenses-table.tsx`, `delete-expense-dialog.tsx` ni `src/lib/permissions.ts`.

Flujo, capa por capa, sin saltos:

```
ExpenseFormDialog ("use client")
  → useCreateExpense / useUpdateExpense (TanStack Query)
    → finance.service (axios)
      → /api/admin/expenses[/id]   (authorize → Zod → resolveReceiptColumns → splitIgv)
        → finance.repository (Drizzle) → Neon
```

Ningún componente importa `db`, Drizzle ni el repositorio; el cálculo del IGV
ocurre en el Route Handler, del lado del servidor, antes de llamar al
repositorio.

### 7.1 Firmas puras — `src/modules/finance/lib/expense-receipt.ts`

```ts
import { carriesIgv } from '@/lib/purchase-receipts';
import { splitIgv } from './igv';

/** Las seis columnas nuevas, siempre las seis: un `UPDATE` parcial dejaría mezcla. */
export type ExpenseReceiptColumns = {
  receiptType: PurchaseReceiptType | null;
  supplierRuc: string | null;
  supplierName: string | null;
  receiptSeries: string | null;
  receiptNumber: string | null;
  igvCents: number | null;
};

/**
 * Traduce el `receipt` del contrato a columnas y calcula el IGV. `null` devuelve las
 * seis en `null`, que es lo que hace que apagar el interruptor limpie de verdad (AC10).
 *
 * El IGV se calcula **aquí y solo aquí**: no hay ninguna otra ruta que escriba
 * `igv_cents`, y ningún schema de entrada lo acepta (AC7).
 */
export function toReceiptColumns(
  receipt: PurchaseReceiptInput | null,
  amountCents: number,
): ExpenseReceiptColumns;

/**
 * La versión del PATCH. Recibe la fila **anterior** y el cuerpo parcial, y decide sobre
 * el estado fusionado:
 *
 * - `receipt` omitido + `amountCents` sin cambio  → devuelve `null` (no hay nada que
 *   escribir; el `UPDATE` no toca las seis columnas).
 * - `receipt` omitido + `amountCents` nuevo       → recalcula el IGV del comprobante
 *   que ya estaba, porque el IGV viejo ya no cuadra con el importe nuevo (AC9).
 * - `receipt: null`                               → las seis a `null` (AC10).
 * - `receipt` con valor                           → columnas nuevas e IGV del importe
 *   resultante.
 */
export function resolveReceiptColumns(
  before: Pick<Expense, 'receiptType' | 'supplierRuc' | 'supplierName' | 'receiptSeries' | 'receiptNumber' | 'amountCents'>,
  patch: UpdateExpenseInput,
): ExpenseReceiptColumns | null;
```

### 7.2 Firma del agregado — `finance.repository.ts`

```ts
import { TAX_CREDIT_RECEIPT_TYPES } from '@/lib/purchase-receipts';

// El `ExpenseTotals` de hoy gana cuatro campos. El `WHERE` es el mismo, el escaneo es
// el mismo y los dos números salen de la misma pasada (D-9).
export type ExpenseTotals = {
  expensesCents: number;
  expenseCount: number;
  igvCreditableCents: number;
  igvCreditableCount: number;
  igvTotalCents: number;
  igvCount: number;
};

// El `in (…)` se construye con `inArray` sobre la tupla derivada del catálogo: el SQL y
// la vista leen la misma regla (AC16). Sin `GROUP BY` en esta consulta, así que no entra
// en la clase de bug del 42803 que documenta el spec 017 §10.
const CREDITABLE = inArray(expenses.receiptType, TAX_CREDIT_RECEIPT_TYPES);
```

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: Seis columnas en `expenses` | Tabla `expense_receipts` 1—1 con FK | La relación es 1—0..1 y **todas** las lecturas necesitan las dos mitades: el listado, el agregado de IGV y la bitácora. Una tabla aparte metería un `LEFT JOIN` en cada una y una transacción de dos escrituras en cada mutación, a cambio de ahorrar seis columnas nulas en una tabla de registro manual. Se justificaría con N comprobantes por gasto, que no es el caso |
| **D-2**: RUC y razón social en texto libre, sin catálogo de proveedores | Tabla `suppliers` con su CRUD | Decidido en el brainstorming (§2) y coherente con el proyecto: `concept` también es texto libre, y una tabla traería CRUD, permisos, seed y gestión de proveedores en uso al borrar. La regla del proyecto es extraer a la tercera repetición (CLAUDE.md §6), y aquí no hay ni una. El día que haya que agrupar gasto por proveedor, el `supplier_ruc` de estas filas es exactamente la semilla de esa tabla |
| **D-3**: El enum de Postgres se construye desde `src/lib/purchase-receipts.ts` | Repetir la tupla en el schema y en Zod, como hicieron `EXPENSE_CATEGORIES` / `expenseCategory` (017, D-4) | El propio 017 dejó escrito el riesgo en un comentario del código: «añadir un valor aquí sin la migración produce un 500 al insertar, no un 400». El spec 022 ya resolvió eso con el catálogo puro y el `pgEnum` derivado, y ese es el patrón vigente del proyecto. Con una sola tupla, el enum de la base, el de Zod y las etiquetas no pueden desalinearse |
| **D-4**: La elegibilidad es una **tabla de dos banderas por tipo**, en un módulo puro | Una lista `TAX_CREDIT_TYPES` a secas, o un `if` en el repositorio y otro en la vista | Son dos preguntas distintas —si el comprobante lleva IGV y si ese IGV es crédito fiscal— y colapsarlas en una obliga a suponer que todo lo que no da crédito tampoco lleva IGV, que es falso para la boleta. Además, la regla está sin verificar (§5.1): en forma de tabla, corregirla es editar cuatro celdas y su test; repartida en condicionales, es una cacería. El `TAX_CREDIT_RECEIPT_TYPES` que consume el SQL se **deriva** de la tabla, así que el agregado y la UI no pueden discrepar (AC16) |
| **D-5**: `igv_cents` se calcula solo en los tipos afectos; en el resto es `null` | Calcular el 18 % en todos los comprobantes «por transparencia», como propone el §5 del diseño | Es el único punto en que este spec se aparta del diseño aprobado, y se señala en §5.1 para que se confirme al aprobar. Un 18 % sobre un recibo por honorarios no es un dato conservador ni transparente: es un número inventado que la tabla pintaría en una columna rotulada «IGV» y que el sub-proyecto #4 podría recoger. `null` dice «este comprobante no lleva IGV», que es una afirmación verdadera y distinta de `0`. Si T1 determina que el tipo sí es afecto, se cambia una celda de la tabla y el cálculo aparece |
| **D-6**: El comprobante viaja como objeto anidado `receipt`, nullable | Cinco campos planos y nullable en el cuerpo | En el `PATCH`, cinco campos planos no distinguen «no los mando» de «bórralos»: haría falta un centinela o un `clearReceipt: true`. Con el objeto, las tres semánticas son las tres del propio tipo —valor, `null`, ausente— y el `refine` de «todo o nada» se escribe una vez dentro del objeto en vez de como un `refine` cruzado entre cinco claves opcionales. Además espeja el `CHECK` de la base, así que Zod y Postgres dicen literalmente lo mismo |
| **D-7**: El `PATCH` recalcula el IGV sobre el estado **fusionado** (`before` + cuerpo) | Calcularlo solo cuando el cuerpo trae `receipt` | Cambiar únicamente el importe de un gasto que ya tenía factura es el caso frecuente —se corrige un tecleo—, y sin recalcular quedaría un `igv_cents` del importe anterior: un dato corrupto que el `CHECK` no atrapa porque sigue siendo menor que el importe. El `before` ya se lee dentro de la transacción para la bitácora (017, D-15), así que no cuesta ni una consulta más |
| **D-8**: Cuatro `CHECK` en la tabla, además de Zod | Confiar solo en la validación de la API | Mismo criterio que el `CHECK (amount_cents > 0)` del 017 (D-6) y que los seis de `electronic_documents` (022): el seed, una migración de datos y un `psql` a mano no pasan por Zod, y un comprobante a medias o un IGV mayor que el importe contaminarían el número que el sub-proyecto #4 va a declarar. El dígito verificador se queda fuera de la base a propósito: el módulo 11 exigiría crear una función en Postgres, y esa comprobación ya está en `isValidRuc()` |
| **D-9**: Los cuatro agregados de IGV se añaden a `findExpenseTotals()` | Una quinta función y una cuarta consulta en el `Promise.all` del resumen | Misma tabla, mismo rango, mismo `WHERE` construido por `buildExpenseFilters()`: una segunda consulta sería un segundo escaneo para números que por definición no pueden divergir del primero. Y al salir de la misma fila del `SELECT`, es imposible que el total de gastos y el IGV del período se calculen sobre filtros distintos. No entra en la clase de bug del `42803` del spec 015: no hay `GROUP BY` |
| **D-10**: La card publica y pinta los dos números por separado | Un solo «IGV de compras» con todo sumado | El número que importa —y el que el sub-proyecto #4 va a restar— es el que da derecho a crédito fiscal. Un único total invitaría a descontar IGV de boletas, que es exactamente la infracción que la regla evita. Publicar el otro aparte conserva la transparencia que pedía el diseño sin mezclar lo que no se puede mezclar (AC14) |
| **D-11**: Se importa `isValidRuc()` de `@/modules/orders/lib/peru-document` | Escribir un verificador propio del módulo financiero, o mudar el archivo a `src/lib/` como se hizo con las primitivas de reporting (017, D-9) | Un segundo módulo 11 sería la copia que se desalinea, y es justo lo que CLAUDE.md §6 prohíbe. La mudanza a `src/lib/` es tentadora —«cómo se valida un RUC peruano» no es una propiedad de los pedidos— pero tocaría dos módulos ya cerrados por una función de doce líneas, y el módulo financiero **ya** importa `formatPrice`, `toCents` y `PRICE_INPUT_PATTERN` de `@/modules/products/lib/price` con la bendición del 017 (D-19). Cuando un tercer módulo lo necesite, la mudanza es un cambio de imports |
| **D-12**: Sin permisos nuevos; el catálogo se queda en 29 | `expenses.set_receipt` o un `finance.tax_credit` de lectura | Es una extensión de un recurso ya protegido, no un recurso nuevo: quien puede registrar un gasto puede describir con qué comprobante llegó, y quien ve el resultado del período ve su IGV. Un permiso que separase «registrar el gasto» de «declarar su comprobante» describiría un reparto de trabajo que no existe. Se evita además la ventana del seed que documentó el 017 §10 |
| **D-13**: Sin índice nuevo | Un parcial `(incurred_on) where receipt_type is not null`, o un compuesto `(receipt_type, incurred_on)` | El agregado ya recorre el rango por `expenses_incurred_on_idx` y los cuatro `FILTER` se resuelven sobre las filas que ese índice acota. Con decenas o cientos de gastos manuales al mes, un índice más sería optimizar sin medida, que es el criterio explícito del 017 §10 |
| **D-14**: `receipt_number` es `varchar(20)` | `integer`, como `electronic_documents.number` | Aquel número lo genera el propio sistema y se formatea al imprimir; este se copia de un papel ajeno en el que ya viene con ceros a la izquierda y, en «otro comprobante», puede no ser solo dígitos algún día. Guardarlo como entero obligaría a decidir cuántos ceros restituir al cotejarlo |
| **D-15**: Sin filtro «solo con comprobante» ni búsqueda por RUC | Un `Select` más junto al de categoría | La pregunta que la pantalla responde es «cuánto IGV de compras tuve este mes», y la responde la card. Filtrar la tabla por comprobante es una pregunta de auditoría que hoy no tiene quien la haga, y añadir un segundo filtro obliga a decidir su interacción con el primero, con la paginación y con los dos estados vacíos que ya existen. Queda en §11 con su enganche |
| **D-16**: Sin retroactividad ni backfill | Marcar los gastos previos con un tipo por defecto | No se puede saber si un gasto de julio llegó con factura. Cualquier valor por defecto sería una afirmación falsa sobre un hecho tributario, y el `null` ya significa exactamente lo que pasó: nadie lo declaró (AC21) |

## 9. Tareas

Orden de dependencia: verificación normativa → catálogo puro → esquema →
migración → lógica pura → schemas → tipos y copys → repositorio → handlers → UI
→ documentación → cierre.

- [x] **T1** — **Bloqueante.** Confirmar contra la normativa SUNAT vigente, por
      cada uno de los cuatro tipos: (a) si el comprobante es afecto a IGV y por
      tanto tiene un 18 % contenido que desglosar, y (b) si ese IGV otorga
      derecho a crédito fiscal a un comprador con RUC. Prestar atención expresa
      a las dos dudas de §5.1: el recibo por honorarios (renta de cuarta
      categoría) y las variaciones sobre crédito fiscal parcial desde boletas
      electrónicas. Escribir el resultado y su fuente en §5.1 de este spec
      **antes** de tocar código; si no se consigue confirmar, dejarlo escrito
      como tal y conservar los valores conservadores · archivo:
      `docs/specs/024-egresos-credito-fiscal.md` · verificación: la tabla de
      §5.1 cita su fuente o declara que sigue sin verificar
- [x] **T2** — Catálogo puro con `PURCHASE_RECEIPT_TYPES`,
      `PURCHASE_RECEIPT_RULES` (con los valores que fije T1),
      `carriesIgv()`, `grantsTaxCredit()`, `TAX_CREDIT_RECEIPT_TYPES` y
      `PURCHASE_RECEIPT_TYPE_LABELS` según §5.3 · archivo:
      `src/lib/purchase-receipts.ts` · verificación: `npm run typecheck`
- [x] **T3** — Tests del catálogo: la tabla cubre los cuatro tipos sin huecos;
      `TAX_CREDIT_RECEIPT_TYPES` contiene exactamente los de
      `grantsTaxCredit: true` y **se deriva**, no está escrita a mano (un tipo
      que cambie de bandera cambia la lista sin tocarla); ningún tipo tiene
      `grantsTaxCredit: true` con `carriesIgv: false`, que sería crédito fiscal
      sobre un impuesto inexistente; y las etiquetas están completas · archivo:
      `src/lib/purchase-receipts.test.ts` · verificación: `npm test`
- [x] **T4** — Enum `purchase_receipt_type` derivado del catálogo, las seis
      columnas y los cuatro `CHECK` de §5.2; exportar el enum desde el barrel ·
      archivos: `src/server/db/schema/expense.ts`,
      `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T5** — Generar la migración y **leer el SQL antes de aplicarlo**: debe
      crear el tipo, añadir seis columnas nullable y cuatro constraints a
      `expenses`, y nada más; en particular, ninguna columna `NOT NULL` sin
      default sobre una tabla con filas, y ningún `DROP` · comandos:
      `npm run db:generate` y `npm run db:migrate` · verificación: el archivo
      `drizzle/0012_*.sql` leído + `npm run db:studio` mostrando las columnas en
      `null` en los gastos existentes (AC21)
- [x] **T6** — `toReceiptColumns()` y `resolveReceiptColumns()` según §7.1,
      apoyadas en `splitIgv()` y en `carriesIgv()` · archivo:
      `src/modules/finance/lib/expense-receipt.ts` · verificación:
      `npm run typecheck`
- [x] **T7** — Tests de `expense-receipt`: `toReceiptColumns(null, …)` devuelve
      las seis en `null`; un tipo afecto con `11800` da `igvCents: 1800` y
      `amount − igv === round(amount / 1.18)`; un tipo no afecto da
      `igvCents: null` conservando proveedor y serie (AC8); el importe mínimo
      `1` no produce un IGV negativo ni igual al importe;
      `resolveReceiptColumns` con `receipt` omitido y sin cambio de importe
      devuelve `null`; con `receipt` omitido y otro importe recalcula el IGV del
      comprobante anterior (AC9); con `receipt: null` devuelve las seis en `null`
      (AC10); y sobre un gasto sin comprobante con `receipt` omitido no inventa
      ninguno · archivo: `src/modules/finance/lib/expense-receipt.test.ts` ·
      verificación: `npm test`
- [x] **T8** — `purchaseReceiptSchema` y el campo `receipt` en
      `createExpenseSchema` / `updateExpenseSchema` según §6.1 · archivo:
      `src/modules/finance/schemas/finance.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T9** — Tests de los schemas: un alta sin `receipt` pasa y produce
      `receipt: null` (AC3); un RUC con el dígito verificador cambiado, uno de
      diez dígitos y uno con prefijo `11` fallan (AC4); un `receipt` sin `type`,
      sin `supplierRuc` o sin `supplierName` falla (AC5); serie sin número falla
      y ninguno de los dos pasa (AC12); un cuerpo que incluye `igvCents` se
      acepta pero **no** lo propaga a la salida del parseo (AC7); la serie en
      minúscula queda en mayúscula; y `updateExpenseSchema` distingue
      `receipt: null` de `receipt` ausente · archivo:
      `src/modules/finance/schemas/finance.schema.test.ts` · verificación:
      `npm test`
- [x] **T10** — Campos del formulario y `superRefine` según §6.2 · archivo:
      `src/modules/finance/schemas/expense-form.schema.ts` · verificación:
      `npm run typecheck`
- [x] **T11** — Tests del schema del formulario: con `hasReceipt: false` un RUC
      vacío o basura **pasa** —los campos ocultos no se validan—; con
      `hasReceipt: true` el RUC inválido falla y el error cuelga de
      `['supplierRuc']`, no de la raíz; y el par serie-número se exige junto ·
      archivo: `src/modules/finance/schemas/expense-form.schema.test.ts` ·
      verificación: `npm test`
- [x] **T12** — `ExpenseReceipt`, `PurchaseIgvTotals` y los dos tipos ampliados
      según §6.3 · archivo: `src/modules/finance/types/finance.types.ts` ·
      verificación: `npm run typecheck`
- [x] **T13** — Copys: título y subtítulo de la card, etiqueta de «sin derecho a
      crédito fiscal», estado vacío del período sin comprobantes, rótulo del
      interruptor y las ayudas de los campos del comprobante —incluida la que
      advierte de que el IGV lo calcula el sistema y no se teclea— · archivo:
      `src/modules/finance/constants.ts` · verificación: `npm run typecheck`
- [x] **T14** — Repositorio: proyectar el comprobante en `findManyExpenses()`
      como objeto `receipt` (o `null` cuando `receipt_type` lo sea), sin añadir
      ninguna consulta ni tocar el `innerJoin` ni el orden existentes · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — Repositorio: los cuatro agregados de §5.4 dentro de
      `findExpenseTotals()`, con `inArray` sobre `TAX_CREDIT_RECEIPT_TYPES` y el
      `::bigint` + `Number()` de las sumas (017, D-11) · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T16** — Tests del repositorio con `PgDialect`, patrón exacto del
      existente: el SQL de `findExpenseTotals` renderiza los cuatro agregados con
      `filter (where …)`, el `in` lleva los tipos elegibles como parámetros y no
      interpolados, el `WHERE` del rango sigue siendo el de
      `buildExpenseFilters` y la consulta **no** tiene `GROUP BY`; y el `SELECT`
      de `findManyExpenses` incluye las seis columnas nuevas · archivo:
      `src/server/repositories/finance.repository.test.ts` · verificación:
      `npm test`
- [x] **T17** — `POST /api/admin/expenses`: construir las columnas con
      `toReceiptColumns(body.data.receipt, body.data.amountCents)` dentro de la
      transacción que ya existe, sin tocar `logAudit` ni la respuesta
      `ExpenseMutated` · archivo: `src/app/api/admin/expenses/route.ts` ·
      verificación: `npm run build`
      · **corrección en revisión**: el «sin tocar `logAudit`» de esta tarea era un
      error del spec. `changes` guardaba la fila entera y la fila ahora trae
      `supplier_ruc`, así que los tres `logAudit()` de este spec pasan por
      `toAuditableExpense()` (§10). La tarea sí toca `logAudit`, y debía.
- [x] **T18** — `PATCH /api/admin/expenses/[id]`: pasar el `before` ya leído por
      el `tx` a `resolveReceiptColumns()` y añadir sus columnas al `UPDATE` solo
      cuando devuelva algo, dejando intacto el `404` y el `changes` de la
      bitácora · archivo: `src/app/api/admin/expenses/[id]/route.ts` ·
      verificación: `npm run build`
- [x] **T19** — `GET /api/admin/finance/summary`: derivar `nonCreditable*` por
      resta entera y publicar `purchaseIgv` en `data`, sin añadir ninguna
      consulta al `Promise.all` · archivo:
      `src/app/api/admin/finance/summary/route.ts` · verificación:
      `npm run build`
- [x] **T20** — Card «IGV de compras» como cuarta tarjeta de la rejilla, con
      `formatPrice`, la cifra con derecho a crédito como valor principal, el
      recuento de comprobantes y la línea del IGV sin derecho cuando lo hay; su
      esqueleto y su estado de error entran en los que el componente ya tiene
      (AC14, AC15) · archivo:
      `src/modules/finance/components/finance-summary-cards.tsx` ·
      verificación: `npm run typecheck`
- [x] **T21** — Columna «Comprobante» con la etiqueta del tipo y `serie-número`
      debajo, la razón social del proveedor bajo el concepto y el IGV bajo el
      importe; guion con texto accesible en las filas sin comprobante (AC19) ·
      archivo: `src/modules/finance/components/expense-columns.tsx` ·
      verificación: `npm run typecheck`
- [x] **T22** — Formulario: `Switch` «¿Tiene comprobante?» (el componente ya
      está en `src/components/ui/switch.tsx`, verificado), los cinco campos en
      un bloque que se **desmonta** al apagarlo, y un `onSubmit` que arma
      `receipt` solo cuando el interruptor está encendido y manda `null` cuando
      no (AC18); en edición, el interruptor arranca encendido si el gasto ya
      tenía comprobante · archivo:
      `src/modules/finance/components/expense-form-dialog.tsx` ·
      verificación: `npm run typecheck`
- [x] **T23** — Encabezado de `/admin/finance`: una línea que diga que el IGV de
      compras es informativo y no entra en el resultado del período · archivo:
      `src/app/(admin)/admin/finance/page.tsx` · verificación: `npm run build`
- [x] **T24** — Documentar en `docs/SETUP.md`: §5.3 las seis columnas, el enum
      `purchase_receipt_type`, los cuatro `CHECK` y la migración `0012`; §6 la
      card de IGV de compras, la regla de elegibilidad y dónde vive, y que no hay
      permisos nuevos · archivo: `docs/SETUP.md` · verificación: lectura
- [x] **T25** — Cierre:
      `npm run typecheck && npm run lint && npm test && npm run build` en verde y
      recorrido manual contra Neon real de AC3, AC6, AC8, AC9, AC10, AC13, AC14 y
      AC21 con una cuenta `super_admin`. El recorrido manual no es opcional: el
      spec 015 documenta un bug de SQL que pasó typecheck, lint y 731 tests y solo
      lo atrapó abrir la página, y aquí hay cuatro `CHECK` nuevos y cuatro
      agregados con `FILTER` que ningún test unitario ejecuta contra Postgres

## 10. Riesgos y consideraciones

- **La regla de elegibilidad no está verificada.** Es el riesgo principal y está
  aislado en §5.1 y en T1. Mientras no se confirme, el sistema subdeclara:
  `boleta` no suma crédito fiscal y `recibo_honorarios` no calcula IGV. Si la
  norma resulta más amplia, la corrección es editar celdas de
  `PURCHASE_RECEIPT_RULES`; ninguna otra pieza del código conoce los valores.
  Los datos ya registrados **no** se corrigen solos: `igv_cents` se calculó al
  guardar, así que abrir la afectación de un tipo exige un recálculo —un
  `UPDATE` de una línea sobre las filas de ese tipo— que hay que ejecutar a
  conciencia. Queda anotado aquí porque es el efecto colateral que no se ve.
- **El 18 % es una aproximación declarada.** Un gasto con bienes exonerados o
  inafectos dentro de una misma factura declara más IGV del que corresponde. Es
  la decisión explícita del usuario (diseño §2) y la misma asunción que
  `splitIgv()` ya documenta para las ventas del spec 022. Lo que este spec añade
  es que la aproximación **no** se extiende a los tipos de comprobante que no son
  afectos en absoluto (D-5).
- **El dato depende de que alguien lo teclee.** Un mes en el que nadie declaró
  comprobantes se ve como un mes sin crédito fiscal. No hay forma de distinguir
  «no hubo facturas» de «nadie las anotó», igual que el 017 ya advirtió para los
  gastos mismos.
- **El RUC del proveedor NO entra en `audit_logs`.** Los tres `logAudit()` de
  `expense.created`, `expense.updated` y `expense.deleted` guardaban la fila
  completa en `changes`, y la fila ahora incluye `supplier_ruc`. Eso era una fuga:
  `/admin/audit-logs` lo leen `manager` y `audit` —tienen `audit_logs.read` y no
  `finance.read`— y `audit-log-columns.tsx` pinta `changes` sin redacción; un RUC
  que empieza por `10` es el de una persona natural y lleva el DNI en sus ocho
  primeros dígitos, así que es PII y no solo un identificador tributario. Se cierra
  con `toAuditableExpense()` en `src/modules/finance/lib/expense-audit.ts`, una
  proyección **positiva** —enumera lo que sale— igual que el `toAuditableProduct()`
  del spec 021 (D-9) y por el mismo motivo que el spec 018 (D-8) con los sueldos.
  `supplier_name` sí se conserva: es una razón social, no un documento de
  identidad, y sin él la bitácora no diría de qué proveedor se habla.
  `ExpenseMutated` se deja sin ampliar por lo mismo (§6), así que el RUC no sale
  por ninguna de las dos puertas.
- **El `CHECK` de IGV no atrapa un IGV desfasado.** `igv_cents < amount_cents`
  descarta lo absurdo, no lo simplemente viejo: un IGV del importe anterior
  seguiría cumpliéndolo. Por eso D-7 recalcula en el `PATCH`, y por eso AC9 es un
  criterio y no una nota.
- **Cambiar el enum cuesta una migración.** Añadir un tipo de comprobante es un
  `ALTER TYPE … ADD VALUE`, que además no puede correr en la misma transacción
  que lo usa. Es el mismo precio que 017 aceptó con las categorías y el motivo de
  que el spec 022 declarase por adelantado los valores que iba a necesitar el
  023. Aquí no se adelanta ninguno: no hay un spec siguiente que se sepa que los
  necesite.
- **Sin índice para el agregado.** Los cuatro `FILTER` recorren las filas que el
  índice de `incurred_on` ya acota. Con volumen manual es irrelevante; el
  candidato futuro, si el registro se automatiza, es un parcial sobre
  `incurred_on where receipt_type is not null` (D-13).
- **Sin N+1 y sin consultas nuevas.** El comprobante sale del mismo `SELECT` del
  listado y el IGV del mismo `SELECT` de los totales. El resumen sigue haciendo
  exactamente tres consultas en paralelo.
- **Sin tests de integración contra Postgres.** Riesgo heredado del 015 y del
  017. Los cuatro `CHECK` y los cuatro agregados con `FILTER` solo se ejecutan de
  verdad en T25, que por eso exige el recorrido manual.
- **Migración sobre una tabla con datos en producción.** Las seis columnas son
  nullable y sin default, así que el `ALTER TABLE` no reescribe filas. Los cuatro
  `CHECK` se validan contra las filas existentes al crearse: todas tienen las
  seis columnas en `null`, y los cuatro se satisfacen con `null` —el de formato
  del RUC porque una expresión `NULL` no viola un `CHECK`—, así que la migración
  no puede fallar por dato previo. Conviene comprobarlo igualmente al leer el SQL
  en T5.
- **Rollback.** `DROP` de las seis columnas y del tipo, **con pérdida de los
  comprobantes declarados**. Si la tabla ya tiene filas con comprobante, el
  rollback es exportarlas antes. El resto del módulo no se toca, así que revertir
  el código sin revertir la migración deja columnas huérfanas e inocuas.
- **Seguridad.** No hay superficie nueva: las mismas tres rutas, los mismos
  cuatro permisos, el mismo `authorize()` en la primera línea de cada verbo. Lo
  que cambia es la sensibilidad del contenido —identificadores tributarios de
  terceros—, que refuerza el D-3 del 017: solo `super_admin` y `admin` leen este
  módulo, `manager` y `audit` no. Esa afirmación solo es cierta porque el RUC no
  llega a `audit_logs`: la bitácora sí la leen `manager` y `audit`, y era la única
  puerta por la que el dato salía del módulo. La cierra `toAuditableExpense()`
  (bullet anterior); sin ella, «`manager` y `audit` no leen este módulo» sería
  falso para el campo más sensible que el spec añade.
- **Sin caché.** Igual que el resto del panel: vista autenticada, por usuario y
  con el resultado del negocio; nada de `revalidate` ni `s-maxage`.

## 11. Fuera de alcance / deuda aceptada

- **El «IGV por pagar».** Este spec produce el crédito fiscal de compras y el
  spec 022 produce el débito de ventas; restar uno del otro, resolver el período
  tributario y presentar el resultado es el sub-proyecto #4 (Impuestos). El
  enganche está listo: `purchaseIgv.creditableCents` de aquí y los
  `electronic_documents.igv_cents` con `issued_at` en el rango de allí.
- **Proveedores como entidad.** Se retoma cuando alguien pida «cuánto le compré
  a este proveedor este año». La migración sería una tabla `suppliers` sembrada
  desde los `supplier_ruc` distintos que estas filas ya habrán acumulado, más una
  FK que conviva con el texto libre de los gastos viejos.
- **Afectación por línea de gasto.** Hoy la unidad es el gasto entero: una
  factura con parte gravada y parte exonerada no se puede representar. El paso
  natural es una tabla de líneas, que es un spec propio y solo tiene sentido si
  el registro deja de ser manual.
- **Un valor `servicios_publicos` en el enum.** Los recibos de luz, agua y
  teléfono sí llevan IGV y hoy caerían en `otro`, que este spec trata como no
  afecto: se subdeclara. Se difiere porque el valor concreto depende del
  resultado de T1, y añadirlo a ciegas sería repetir el error que §5.1 evita.
- **Retención de cuarta categoría en el recibo por honorarios.** Un recibo por
  honorarios lleva su propia retención de renta, que no es IGV y que este spec no
  registra. Es un campo más y una regla más el día que la empresa pague
  honorarios con frecuencia.
- **Detracciones y percepciones.** Afectan al flujo de caja y al momento en que
  el crédito fiscal se puede usar, no al importe. Fuera hasta que exista
  conciliación bancaria, que tampoco existe.
- **Backfill de los gastos anteriores.** No se hará nunca automáticamente
  (D-16). Si hiciera falta regularizar un período concreto, es edición manual
  gasto a gasto desde la propia pantalla, que ya lo permite con
  `expenses.update`.
- **Filtro por comprobante y búsqueda por RUC en la tabla** (D-15). Cuando haga
  falta, el patrón es el mismo `Select` con centinela `all` de la categoría, y
  para el RUC el `ilike` con `escapeLikePattern` que ya usan productos e
  inventario.
- **Exportación del registro de compras a CSV.** Es la forma que toma esta deuda
  en este módulo: un registro de compras es, literalmente, un archivo que se
  presenta. Sigue diferida como en 014, 015, 016 y 017, pero aquí por primera vez
  tiene un consumidor identificable.
