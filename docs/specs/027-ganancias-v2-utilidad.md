---
id: 027
title: Ganancias v2 — utilidad bruta, operativa y neta
status: done
module: finance
scope: admin
created: 2026-09-23
---

# 027 — Ganancias v2: utilidad bruta, operativa y neta

## 1. Contexto

`/admin/finance` responde hoy «cuánto ganamos» con una resta de dos números:
`netCents = revenueCents − expensesCents` (`summary/route.ts:48`), pintado en la
card «Resultado del período» (`finance-summary-cards.tsx:309-315`). El propio
encabezado de la página lo desmiente: «**No es utilidad contable**: no descuenta
el costo de la mercadería vendida, la nómina, las comisiones de pago ni los
impuestos» (`page.tsx:28-33`). Este spec es exactamente lo que esa advertencia
dejó pendiente.

Desde entonces llegaron las cuatro piezas que faltaban, todas `done`:
`products.average_cost_cents` (021), el IGV de compras con su tabla de crédito
fiscal (024), las ventas declarables con `buildDeclarableFilter()` (025) y la
Renta RER estimada con `estimateRerIncomeTax()` (026). La nómina (018) estaba
desde antes. Lo único que **no** existe es el eslabón entre el costo y la venta:
`order_items` congela nombre, imagen y precio (`order-item.ts:23-25`) pero no el
costo, así que hoy es imposible saber cuánto costó lo que se vendió en un pedido.

Es el **sub-proyecto #5 del roadmap de Finanzas**
(`docs/superpowers/specs/2026-09-21-modulo-finanzas-design.md`), y su diseño
previo es `docs/superpowers/specs/2026-09-21-ganancias-v2-design.md`. Es el más
dependiente de todo el roadmap y el que cierra los cinco primeros conceptos.

## 2. Objetivo

Una persona con `finance.read` abre `/admin/finance`, elige un rango y lee el
resultado del período como un estado de resultados de tres niveles —utilidad
bruta, operativa y neta—, cada uno con su margen, en lugar del «neto»
simplificado de hoy.

## 3. Alcance

### Incluye

- Columna nueva `order_items.cost_cents_snapshot`, nullable, con su migración.
  La escribe el webhook de fulfillment **en la misma transacción en que descuenta
  el stock**, copiando `products.average_cost_cents` vigente en ese instante.
- Agregado de **COGS** del rango sobre esas líneas, con el recuento de líneas sin
  costo que lo marca como parcial.
- Agregado de **nómina** del rango (`payroll_payments` vivos).
- Los tres niveles de utilidad y sus tres márgenes, calculados en un módulo puro
  con test.
- **Reemplazo** de `netCents` y `marginPercent` en el contrato y en la pantalla
  por el bloque de tres niveles. No coexisten dos cifras de «ganancia» (§8, D-11).
- Reescritura del encabezado de `/admin/finance`, que hoy afirma lo contrario de
  lo que la pantalla pasará a hacer.

### No incluye (explícito)

- **Costeo retroactivo.** Los pedidos fulfillados antes de la migración quedan
  con `cost_cents_snapshot = null` en todas sus líneas. No se reconstruye
  historia con el costo promedio de hoy: sería inventar un dato que no existió
  (D-4).
- **Tratar el costo ausente como `0`.** `null` se propaga como «parcial», nunca
  como cero (D-3, AC12).
- **Reducir el COGS por una devolución.** El spec 023 no repone stock —verificado:
  `order-adjustment.service.ts` no toca `products` ni `stock_movements`—, así que
  una nota de crédito parcial baja el ingreso y no el costo (§10, §11).
- **El IGV como resta de la utilidad.** Es un tributo de terceros que la empresa
  recauda y traslada, no un costo suyo (D-10). Solo la Renta reduce la utilidad.
- **Cambiar la card «Ventas confirmadas»** ni el KPI del dashboard (015). La
  utilidad cuelga de las ventas **declarables**; la caja sigue publicándose al
  lado, como estableció 025.
- **Cambiar la card «Gastos operativos»**, que sigue mostrando el importe
  registrado. Lo neto del IGV recuperable es una línea del bloque de utilidad,
  no un segundo valor para la misma card (D-8).
- **Comisiones de pasarela de pago (Stripe) como línea propia.** Siguen siendo un
  gasto más, a registrar a mano (017, §3).
- **Cierre de período**, gráficos y exportación. Mismo criterio de 017 (D-8,
  D-13), 021, 024, 025 y 026.
- **Ningún permiso nuevo.** El catálogo se queda en 29 códigos.

## 4. Criterios de aceptación

- [x] AC1 — Dado un visitante sin sesión, cuando pide
      `GET /api/admin/finance/summary`, entonces recibe `401` con cuerpo
      `{ message }` y no un `307` al formulario de Clerk.
- [x] AC2 — Dado un usuario con sesión y sin `finance.read`, cuando pide el
      endpoint con una query inválida, entonces recibe `403` y no `400`.
- [x] AC3 — Dado un pedido que pasa a `paid` por el webhook de Stripe, entonces
      cada una de sus líneas queda con `cost_cents_snapshot` igual al
      `average_cost_cents` que el producto tenía **en ese instante**, dentro de la
      misma transacción que descuenta el stock.
- [x] AC4 — Dado un producto con `average_cost_cents = null` al momento de la
      venta, entonces su línea queda con `cost_cents_snapshot = null` y **nunca**
      con `0`.
- [x] AC5 — Dado un producto cuyo costo promedio cambia después de la venta,
      entonces la línea ya vendida **no** se reescribe: el snapshot es histórico,
      igual que `price_cents_snapshot`.
- [x] AC6 — Dada la creación del pedido en el checkout, entonces `order_items` se
      inserta **sin** `cost_cents_snapshot`: el costo se congela al confirmarse la
      venta, no al crearse el carrito.
- [x] AC7 — Dada una reentrega del mismo evento de Stripe, entonces el
      `cost_cents_snapshot` no se reescribe: el `markPaid` condicional corta antes
      y la transacción entera no llega a ejecutarse dos veces.
- [x] AC8 — Dado el ingreso base de toda la jerarquía, entonces es
      `declarable.baseCents` de `findDeclarableTaxTotals()` —la **misma función**
      del spec 026— y por tanto **exactamente el mismo número** que la base de
      Renta de `/admin/finance/taxes` para el mismo rango.
- [x] AC9 — Dado el COGS del rango, entonces cuenta las líneas de los pedidos
      cuyo **comprobante original vigente** (`related_document_id is null`,
      `status = 'issued'`) cae en el rango por `issued_at`, usando el mismo
      `buildDeclarableFilter()` y nunca `orders.created_at`.
- [x] AC10 — Dado un pedido cuyo original quedó `voided`, entonces su costo **no**
      entra en el COGS del rango, igual que su venta no entra en el ingreso.
- [x] AC11 — Dado un pedido con comprobante reemitido tras una corrección de
      comprador, entonces su costo cuenta **una sola vez**, en el rango del
      comprobante vigente.
- [x] AC12 — Dado un rango con al menos una línea vendida sin costo, entonces la
      respuesta trae `uncostedLineCount > 0` y la vista rotula la utilidad bruta
      como **parcial**, con el conteo y un enlace a `/admin/finance/pricing`.
- [x] AC13 — Dado un rango sin ninguna línea sin costo, entonces el aviso de
      parcial **no se pinta**: una advertencia permanente que casi siempre dice
      cero es ruido.
- [x] AC14 — Dados los gastos operativos de la utilidad, entonces son
      `expensesCents − igvCreditableCents` de `findExpenseTotals()`: un gasto con
      factura resta solo su base y uno con boleta, recibo por honorarios, otro
      comprobante o sin comprobante resta su importe completo.
- [x] AC15 — Dado un cambio en `PURCHASE_RECEIPT_RULES`, entonces la utilidad
      operativa cambia con él sin tocar este spec: la elegibilidad se lee a través
      de `TAX_CREDIT_RECEIPT_TYPES`, no de una lista escrita aquí.
- [x] AC16 — Dada la nómina del rango, entonces suma `amount_cents` de los pagos
      con `voided_at is null` cuyo `paid_at` cae entre `fromDay` y `toDay`, **con
      los dos extremos inclusive**, igual que los gastos y nunca con la ventana
      semiabierta de los instantes.
- [x] AC17 — Dado un pago de nómina anulado, entonces no suma, aunque su
      `paid_at` siga en el rango.
- [x] AC18 — Dada la utilidad bruta, entonces es `ingresoNeto − cogs`; la
      operativa, `bruta − gastosNetos − nómina`; y la neta, `operativa − renta`,
      todas restas de enteros en céntimos.
- [x] AC19 — Dada la Renta que resta de la utilidad neta, entonces sale de
      `estimateRerIncomeTax()` sobre la misma base del AC8, y es el mismo número
      que muestra `/admin/finance/taxes`.
- [x] AC20 — Dado el IGV del período, entonces **no** resta en ninguno de los tres
      niveles, y la pantalla lo dice.
- [x] AC21 — Dado un ingreso neto de `0`, entonces los tres márgenes son `null`
      —no `0`, `Infinity` ni `NaN`— y los tres importes se publican igualmente.
- [x] AC22 — Dado un ingreso neto **negativo** (las correcciones del rango superan
      lo emitido), entonces los tres márgenes son `null`: un porcentaje sobre base
      negativa invierte el signo y afirmaría lo contrario de lo que pasó.
- [x] AC23 — Dado un nivel de utilidad negativo, entonces la vista lo marca como
      «Pérdida» con etiqueta, icono y color —los tres, nunca solo color— (017, AC9).
- [x] AC24 — Dado el contrato de `/api/admin/finance/summary`, entonces
      `netCents` y `marginPercent` **ya no existen** en `FinanceSummary` y ningún
      componente los lee. El `netCents` de `IgvSettlement` (spec 026) es otro campo
      de otro contrato y **no se toca**: verificado, son los dos únicos `netCents`
      del proyecto y comparten nombre sin compartir significado.
- [x] AC25 — Dado el encabezado de `/admin/finance`, entonces ya no afirma que la
      cifra «no es utilidad contable» por no descontar costo, nómina ni impuestos.
- [x] AC26 — Dado cualquier importe del JSON, entonces es un entero en céntimos;
      la división por 100 solo ocurre al formatear en la vista.
- [x] AC27 — Dado el catálogo de permisos, entonces sigue en 29 códigos, y **todo
      rol con `finance.read` tiene también `payroll.read`**, verificado por un test
      sobre `ROLE_PERMISSIONS`: esta pantalla publica el total de nómina del rango.
- [x] AC28 — Dada la primera carga, entonces el bloque de utilidad muestra
      esqueletos; ante un fallo de red muestra su mensaje con «Reintentar»; y al
      cambiar de rango conserva las cifras anteriores.
- [x] AC29 — Dado el directorio `drizzle/`, entonces el journal pasa de
      `0012_careful_cargill` a `0013_*`, con **una sola** migración y sin backfill.
- [x] AC30 — Dada la arquitectura, entonces ningún componente importa `db`,
      Drizzle ni un repositorio: la página consume hook → service → Route Handler.

## 5. Modelo de datos

**Una columna nueva y una migración.** Es el único cambio de esquema del
sub-proyecto: los tres niveles de utilidad son un cálculo, no un dato que se
persista, igual que el resto del módulo financiero (no hay tabla de «resultados
mensuales»).

### 5.1 `order_items.cost_cents_snapshot`

| Columna | Tipo | Nota |
|---|---|---|
| `cost_cents_snapshot` | `integer` **nullable**, sin default | Costo unitario promedio del producto en el instante en que se confirmó la venta. `null` = sin costo registrado entonces |

Firma propuesta, junto a los `_snapshot` que ya existen
(`src/server/db/schema/order-item.ts:23-25`):

```ts
// Cuarto `_snapshot` de la tabla y por la misma razón que los otros tres: un pedido
// pasado debe decir lo que costó **entonces**, no lo que costaría hoy. Lo escribe el
// webhook de fulfillment en la misma transacción que descuenta el stock (spec 027).
//
// **Nullable y sin default, a propósito.** `products.average_cost_cents` es nullable
// (spec 021) y `null` significa «sin costo registrado»: un `0` diría «me costó gratis»
// e inflaría la utilidad bruta con una afirmación falsa. El nulo viaja hasta la pantalla
// como «cálculo parcial» (§6.5).
costCentsSnapshot: integer('cost_cents_snapshot'),
```

y el `CHECK`, mismo criterio que `products_average_cost_cents_positive`
(`product.ts:67-70`): un `0` o un negativo aquí solo puede venir de un `psql` a
mano o de una migración de datos, y ninguno pasa por el código.

```ts
check(
  'order_items_cost_cents_snapshot_positive',
  sql`${t.costCentsSnapshot} is null or ${t.costCentsSnapshot} > 0`,
),
```

**Sin índice nuevo.** `order_items_order_id_idx` ya existe
(`order-item.ts:28`) y es el que sostiene el join del COGS; la columna nueva se
**agrega**, no se filtra, así que un índice sobre ella no participaría en el plan
(mismo razonamiento verificado que 026, D-11).

**Sin backfill.** La migración es un `ALTER TABLE ... ADD COLUMN` a secas: sin
`UPDATE` de relleno, sin default. Lo anterior queda en `null` y la pantalla lo
declara parcial (D-4, AC29).

### 5.2 Dónde se escribe el snapshot — verificado en el código actual

El documento de diseño dejó esto abierto (§8) y apuntaba al webhook del spec 007.
Hoy esa lógica ya no vive en el Route Handler: está en
`src/server/services/order-fulfillment.service.ts:85-123`, dentro de
`fulfillCheckoutSession()`, y su transacción hace cuatro cosas en este orden:

1. `orderRepository.markPaid(tx, orderId, …)` — UPDATE condicional
   `WHERE status = 'pending'`. Si devuelve `null`, la transacción se sale: **es la
   idempotencia de todo el bloque** (AC7).
2. `findByIdWithItems` + `decrementStockAndAudit(...)` — el descuento de stock.
3. `queueOriginalDocument(...)` — encola el comprobante, sin red.
4. `logAudit(... 'order.paid' ...)`.

El snapshot entra **entre el paso 2 y el paso 3**: es el mismo instante que el
descuento de stock —el momento en que la venta se concreta— y queda antes de la
única operación que puede lanzar por datos del comprador.

No hace falta leer `products`: es un `UPDATE … FROM` de una sola sentencia.

```sql
update order_items
   set cost_cents_snapshot = p.average_cost_cents
  from products p
 where p.id = order_items.product_id
   and order_items.order_id = $1
```

- **Ni una consulta más.** No relee el catálogo, no toca el `RETURNING` de
  `decrementStock()` y no depende del array `items` que el servicio ya cargó
  (D-2).
- **Sin `coalesce`.** Si `average_cost_cents` es `null`, la columna queda `null`
  (AC4). Escribir `coalesce(..., 0)` es exactamente el bug que este spec existe
  para evitar.
- Corre dentro de la `tx` del webhook, así que o se guarda con el `paid` o no se
  guarda nada.

### 5.3 Reglas de cálculo (normativas)

**Rango.** El mismo `resolveFinanceRange()` de siempre: días inclusivos
`[fromDay, toDay]` en `America/Lima` y su ventana semiabierta de instantes
`[from, to)`. El ingreso y el COGS usan los instantes (`issued_at`); los gastos y
la nómina, los días (`incurred_on`, `paid_at`). Los cuatro derivan del mismo par
de días.

**Ingreso neto del período** — base de los tres márgenes:

```
ingresoNeto = findDeclarableTaxTotals(range).baseCents
```

Sin fórmula nueva y sin consulta nueva: es la función que el spec 026 ya
construyó sobre `buildDeclarableFilter()`, y su `baseCents` es la suma **sin IGV**
de las ventas declarables del rango, con el signo del `kind`. Es, por
construcción, el mismo número que la base de Renta de `/admin/finance/taxes`
(AC8, D-1).

> El documento de brainstorming (§5) derivaba aquí una fórmula propia
> —`boleta+factura − nota_credito + nota_debito`—. Es la misma que el spec 025
> descartó y por los mismos motivos (025, §5.2): una nota de crédito con motivo
> 01, 06, 02 o 03 deja `voided` al original, así que esa fórmula daría ingreso
> negativo en una anulación fuera de ventana y cero en una corrección de
> comprador. **No se deriva nada: se llama a la función que ya decide esto.**

**COGS del período:**

```sql
select
  coalesce(sum(oi.cost_cents_snapshot::bigint * oi.quantity), 0)::bigint as amount_cents,
  count(*)::int                                                          as line_count,
  count(*) filter (where oi.cost_cents_snapshot is null)::int            as uncosted_line_count
from electronic_documents d
left join electronic_documents p on p.id = d.related_document_id
join order_items oi on oi.order_id = d.order_id
where <buildDeclarableFilter(range, p)>
  and d.related_document_id is null
```

- El ancla del período es **el comprobante original vigente**, no el pedido: el
  costo se reconoce en el mismo período en que se reconoce su ingreso (AC9).
- `related_document_id is null` restringe a originales. Sobre ellos, la condición
  (c) de `buildDeclarableFilter` —«sin padre o padre `issued`»— es trivialmente
  cierta; lo que se comparte y lo que importa es el resto: `status = 'issued'` y
  la ventana de `issued_at` con su extremo superior **estricto**. Se importa la
  función en vez de reescribir esas dos condiciones (D-5).
- **Sin duplicación de filas**: el índice único parcial
  `electronic_documents_one_original_per_order_idx`
  (`electronic-document.ts:115-117`) garantiza **un solo original no anulado por
  pedido**, así que el join no abanica. Un original `voided` queda fuera por
  `status` (AC10) y el reemitido aporta en su propio rango (AC11).
- `::bigint` **antes** del producto, como `LINE_REVENUE` de
  `metrics.repository.ts:110`: `costo × cantidad` en `int4` desborda antes que la
  suma.
- `sum` ignora los nulos, así que una línea sin costo aporta `0` **a la suma** y
  `1` a `uncosted_line_count`. Esa asimetría es el dato: el COGS que se muestra es
  el de lo que sí tiene costo, y la vista dice cuántas líneas faltan (AC12).

**Gastos operativos netos del IGV recuperable:**

```
gastosNetos = findExpenseTotals(range).expensesCents
            − findExpenseTotals(range).igvCreditableCents
```

Una resta entera sobre dos campos que **ya vienen en la misma fila del mismo
`SELECT`** que el handler ya pide (`finance.repository.ts:317-346`). Ni una
consulta nueva, ni una función nueva (D-6). Verificado contra la tabla real de
`src/lib/purchase-receipts.ts:36-45`, que es la que decide:

| Tipo | `carriesIgv` | `grantsTaxCredit` | `igv_cents` | Lo que resta de la utilidad |
|---|---|---|---|---|
| `factura` | sí | **sí** | calculado | **solo la base** (`amount − igv`) |
| `boleta` | sí | no | calculado | el **importe completo** |
| `recibo_honorarios` | no | no | `null` | el importe completo |
| `otro` | no | no | `null` | el importe completo |
| sin comprobante | — | — | `null` | el importe completo |

> **Esto corrige la fórmula del brainstorming (§5), que no es implementable.**
> Aquella decía
> `sum(base_cents WHERE receipt_type IN ('factura','recibo_honorarios')) + …`, y
> dos cosas fallan contra el código real: (a) **`expenses` no tiene `base_cents`**
> —verificado en `src/server/db/schema/expense.ts:40-119`: solo `amount_cents` e
> `igv_cents`—, y (b) `recibo_honorarios` tiene `carriesIgv: false`, así que no
> hay IGV que devolver y restar «solo su base» le quitaría al gasto un impuesto
> que nunca pagó. La regla correcta no es «lleva IGV» sino **«ese IGV vuelve como
> crédito fiscal»**, que es justo `grantsTaxCredit` (AC14, AC15).

**Nómina del período:**

```sql
select coalesce(sum(amount_cents), 0)::bigint as amount_cents,
       count(*)::int                          as payment_count
from payroll_payments
where voided_at is null
  and paid_at >= $fromDay
  and paid_at <= $toDay
```

Verificado en `src/server/db/schema/payroll-payment.ts`: `paid_at` es `date`
con `mode: 'string'` (línea 18), así que el rango es el de **días inclusivos** de
los gastos y no la ventana semiabierta de los instantes (AC16); `voided_at is
null` es «pago vivo» (línea 25); y el importe es el congelado al pagar (línea 22).

**Los tres niveles:**

```
utilidadBruta     = ingresoNeto − cogs
utilidadOperativa = utilidadBruta − gastosNetos − nomina
utilidadNeta      = utilidadOperativa − rentaEstimada

margen(nivel) = ingresoNeto > 0 ? redondeo1(nivel / ingresoNeto × 100) : null
```

`rentaEstimada = estimateRerIncomeTax(ingresoNeto)` — la función del spec 026,
tal cual (AC19). El IGV **no** aparece en ninguna de las tres líneas (AC20, D-10).

El margen es `null` con base **no positiva** y no solo con base cero (AC21,
AC22): `marginPercent()` de `finance-math.ts` ya devuelve `null` en `0`, pero con
una base negativa devolvería un porcentaje de signo invertido —`marginPercent(-1000,
-500) === 50`— que diría «50 % de margen» sobre un rango en el que no hubo
ingresos. El guard vive en el módulo nuevo, no dentro de `marginPercent()`, que lo
comparte con el margen unitario del spec 021 donde el precio nunca es negativo
(D-9).

## 6. Contratos de API

Ninguna ruta nueva. Un endpoint cambia de forma: pierde dos campos y gana uno.

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/finance/summary` | `finance.read` | query: `from?`, `to?` | `FinanceSummaryResponse` **−`netCents` −`marginPercent` +`profit`** | 400, 401, 403, 500 |

Sin cambios en el schema Zod de entrada: `financeRangeSchema` ya cubre el rango.
Un rango vacío sigue siendo `200` con ceros, nunca `404`.

### 6.1 Tipos de salida — `src/modules/finance/types/finance.types.ts`

```ts
// Un nivel del estado de resultados. El margen viaja al lado del importe y no se
// recalcula en la vista: es la misma regla de redondeo que el resto del módulo.
export type ProfitLevel = {
  amountCents: number;
  /** `null` cuando el ingreso neto no es positivo. Nunca `0`, `Infinity` ni `NaN` (AC21, AC22). */
  marginPercent: number | null;
};

// El costo de lo vendido y **su nivel de confianza**, juntos. Separarlos permitiría
// pintar el importe sin la advertencia, que es exactamente el error que este spec evita.
export type CostOfGoodsSold = {
  /** Suma de `cost_cents_snapshot × quantity`. Las líneas sin costo aportan `0` aquí. */
  amountCents: number;
  /** Líneas vendidas contadas en el rango. */
  lineCount: number;
  /**
   * Líneas sin `cost_cents_snapshot`. `> 0` ⇒ el COGS del rango es **parcial** y la
   * utilidad bruta está sobreestimada. Nunca se resuelve asumiendo `0` (D-3).
   */
  uncostedLineCount: number;
};

// El estado de resultados del rango. Se publican también los sustraendos, no solo los
// tres totales: tres números sin las restas que los separan no se pueden auditar a ojo.
export type PeriodProfit = {
  /**
   * Ingresos netos **sin IGV** de las ventas declarables. Base de los tres márgenes y el
   * mismo número que la base de Renta de `/admin/finance/taxes` (AC8).
   */
  netRevenueCents: number;
  cogs: CostOfGoodsSold;
  /** `netRevenueCents − cogs.amountCents`. */
  gross: ProfitLevel;
  /** Gastos del rango **netos del IGV con derecho a crédito fiscal** (§5.3, AC14). */
  operatingExpensesCents: number;
  payrollCents: number;
  payrollPaymentCount: number;
  /** `gross − operatingExpenses − payroll`. */
  operating: ProfitLevel;
  /** Renta RER estimada del rango. El IGV **no** entra aquí (D-10). */
  incomeTaxCents: number;
  /** `operating − incomeTax`. */
  net: ProfitLevel;
};

export type FinanceSummary = {
  revenueCents: number;
  orderCount: number;
  /** Importe registrado de los gastos, con IGV incluido: lo que salió de caja. */
  expensesCents: number;
  expenseCount: number;
  expensesByCategory: ExpenseCategoryTotal[];
  purchaseIgv: PurchaseIgvTotals;
  declarableSales: DeclarableSales;
  /**
   * **Reemplaza** a `netCents` y `marginPercent` del spec 017 (D-11): dos cifras de
   * «ganancia» distintas en la misma pantalla es peor que una sola bien definida.
   */
  profit: PeriodProfit;
};
```

### 6.2 Firmas del repositorio

```ts
// src/server/repositories/finance.repository.ts
import type { CostOfGoodsSold } from '@/modules/finance/types/finance.types';

/**
 * COGS del rango: las líneas de los pedidos cuyo comprobante **original vigente** cae en
 * el rango (§5.3). Importa `buildDeclarableFilter()`, no lo copia (AC9, D-5).
 *
 * Devuelve el tipo **publicado** y no uno propio del repositorio, igual que
 * `findDeclarableSalesByKind()` devuelve `DeclarableSalesByKind[]` (025): los tres campos
 * viajan al contrato tal cual, y dos tipos idénticos con nombres distintos solo serían
 * algo más que mantener sincronizado.
 */
export async function findCogsTotals(
  range: InstantRange,
  reader?: Reader,
): Promise<CostOfGoodsSold>;

export type PayrollTotals = { amountCents: number; paymentCount: number };

/** Pagos de nómina vivos del rango, por `paid_at` (§5.3, AC16, AC17). */
export async function findPayrollTotals(
  range: DayRange,
  reader?: Reader,
): Promise<PayrollTotals>;
```

Las dos viven en `finance.repository.ts` y no en `order.repository.ts` ni en
`payroll-payment.repository.ts` por la misma razón que `findSalesTotals()`
consulta `orders` desde aquí: son agregados del resumen financiero, no lecturas
de aquellos dominios (017, D-1; 025, §6.2). Y ninguna admite `category`: la firma
es lo que impide colar el filtro del detalle en el resultado del período.

```ts
// src/server/repositories/order.repository.ts

/**
 * Congela el costo promedio vigente en las líneas del pedido (§5.2). Solo `Tx`: corre
 * dentro de la transacción del webhook o no corre.
 */
export async function snapshotItemCosts(tx: Tx, orderId: string): Promise<void>;
```

### 6.3 Forma del handler — `src/app/api/admin/finance/summary/route.ts`

```ts
// Ocho lecturas independientes y fijas: el coste es el de la más lenta, no la suma
// (015, D-5). Las tres últimas son las de este spec.
const [
  sales, expenseTotals, byCategory, declarableByKind, uninvoicedOrderCount,
  declarableTax, cogs, payroll,
] = await Promise.all([
  financeRepository.findSalesTotals(range),
  financeRepository.findExpenseTotals(range),
  financeRepository.findExpenseTotalsByCategory(range),
  financeRepository.findDeclarableSalesByKind(range),
  financeRepository.findUninvoicedPaidOrderCount(range),
  // La misma función que alimenta `/admin/finance/taxes`: es lo que hace imposible que
  // las dos pantallas discrepen sobre el ingreso neto del rango (AC8).
  financeRepository.findDeclarableTaxTotals(range),
  financeRepository.findCogsTotals(range),
  financeRepository.findPayrollTotals(range),
]);

const profit: PeriodProfit = buildPeriodProfit({
  netRevenueCents: declarableTax.baseCents,
  cogs,
  // Resta entera sobre dos campos de la misma fila del mismo SELECT (§5.3, D-6).
  operatingExpensesCents: expenseTotals.expensesCents - expenseTotals.igvCreditableCents,
  payrollCents: payroll.amountCents,
  payrollPaymentCount: payroll.paymentCount,
  // La misma función pura que `/admin/finance/taxes`, sobre la misma base (AC19).
  incomeTaxCents: estimateRerIncomeTax(declarableTax.baseCents),
});
```

`netCents` y `marginPercent` desaparecen del cuerpo, y con ellos el único
consumidor de `marginPercent()` en este archivo —la función sigue viva: la usa
`pricing-math.ts` y ahora también `profit.ts`—.

### 6.4 Módulo puro — `src/modules/finance/lib/profit.ts`

```ts
import { marginPercent } from './finance-math';

// El guard vive aquí y no dentro de `marginPercent()`: aquella la comparte el margen
// unitario del spec 021, donde el precio nunca es negativo, y meterle una regla que solo
// necesita esta pantalla cambiaría el comportamiento de la otra (D-9).
function level(amountCents: number, netRevenueCents: number): ProfitLevel {
  return {
    amountCents,
    marginPercent: netRevenueCents > 0 ? marginPercent(netRevenueCents, amountCents) : null,
  };
}

/**
 * Las tres restas del estado de resultados, en aritmética entera de céntimos. Función
 * pura —sin Drizzle, sin React, sin Zod— para que el handler no calcule y los casos
 * borde tengan test (§9, T11).
 *
 * El IGV **no** es un parámetro: no resta de ninguno de los tres niveles (D-10).
 */
export function buildPeriodProfit(input: {
  netRevenueCents: number;
  cogs: CostOfGoodsSold;
  operatingExpensesCents: number;
  payrollCents: number;
  payrollPaymentCount: number;
  incomeTaxCents: number;
}): PeriodProfit;
```

## 7. Arquitectura y archivos afectados

- `src/server/db/schema/order-item.ts` — columna `cost_cents_snapshot` y su `CHECK`.
- `drizzle/0013_*.sql` + `drizzle/meta/` — migración generada, sin backfill.
- `src/server/repositories/order.repository.ts` — `snapshotItemCosts()`.
- `src/server/repositories/order.repository.test.ts` — su SQL compilado.
- `src/server/services/order-fulfillment.service.ts` — la llamada, entre el
  descuento de stock y `queueOriginalDocument`.
- `src/server/repositories/finance.repository.ts` — `findCogsTotals()` y
  `findPayrollTotals()`.
- `src/server/repositories/finance.repository.test.ts` — sus SQL compilados.
- `src/modules/finance/lib/profit.ts` + `.test.ts` — **nuevos**.
- `src/modules/finance/types/finance.types.ts` — `ProfitLevel`,
  `CostOfGoodsSold`, `PeriodProfit`; fuera `netCents` y `marginPercent`.
- `src/app/api/admin/finance/summary/route.ts` — ocho lecturas y la composición.
- `src/modules/finance/constants.ts` — copys del bloque y del aviso de parcial.
- `src/modules/finance/components/period-profit-card.tsx` — **nuevo**,
  presentacional puro.
- `src/modules/finance/components/finance-summary-cards.tsx` — se va la card
  «Resultado del período» y con ella `NetResult`; la rejilla vuelve a cuatro.
- `src/modules/finance/components/finance-overview.tsx` — monta el bloque.
- `src/app/(admin)/admin/finance/page.tsx` — encabezado reescrito.
- `src/lib/permissions.test.ts` — el invariante del AC27.
- `docs/SETUP.md` — §5.3 (columna y migración `0013`) y §6 (módulo financiero).

**Sin cambios**, y conviene escribirlo para que no se toquen: `buildDeclarableFilter()`,
`findDeclarableTaxTotals()`, `findExpenseTotals()`, `rer.ts`, `finance-math.ts`,
`purchase-receipts.ts` y `src/lib/permissions.ts` —se **usan**, no se editan—;
`src/server/services/checkout.service.ts`, que sigue insertando las líneas sin
costo (AC6); `product.repository.decrementStock()`; `/api/admin/finance/taxes` y
toda la pantalla de impuestos; `finance-range-filter.tsx`, el service, los hooks y
la tabla de gastos.

Flujo, capa por capa, sin saltos:

```
FinanceOverview ("use client")
  → useFinanceSummary (TanStack Query)
    → finance.service (axios)
      → /api/admin/finance/summary   (authorize → Zod → buildPeriodProfit)
        → finance.repository (Drizzle) → Neon
```

`period-profit-card.tsx` recibe `PeriodProfit` por props y no consulta nada
(AC30). El único módulo compartido que el cliente importa es el puro.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: El ingreso base es `findDeclarableTaxTotals().baseCents`, la función del spec 026 | Derivar la fórmula del documento de brainstorming (§5) sobre `base_cents` | Es la misma fórmula que 025 ya descartó, aplicada a otra columna: una nota de crédito con motivo 01, 06, 02 o 03 deja `voided` al original (`adjustment.ts:82-90`, `electronic-document.service.ts:386-413`), así que daría ingreso **negativo** en una anulación fuera de ventana y **cero** en una corrección de comprador. Llamar a la función que 026 ya construyó sobre `buildDeclarableFilter()` no solo evita el bug: hace **estructuralmente imposible** que la utilidad y la Renta partan de bases distintas, que es la incoherencia que más caro costaría explicar |
| **D-2**: El snapshot es un `UPDATE … FROM products` de una sentencia, dentro de la transacción del webhook | Ampliar el `RETURNING` de `decrementStock()` con `average_cost_cents` y escribir línea por línea | `decrementStock()` ya hace un UPDATE por línea (`product.repository.ts:312-329`); añadirle otro por línea duplica los viajes dentro de la transacción del webhook, que corre contra el corte de ~10 s de Stripe. Y acoplaría el costeo al descuento de stock: el día que aquel cambie de forma —un `UPDATE … FROM (VALUES …)`, como su propio comentario anticipa—, el costeo se rompería con él. Una sentencia declarativa sobre `order_id` no necesita el array de líneas, no relee el catálogo y no añade latencia apreciable |
| **D-3**: `null` se propaga como «parcial»; jamás se sustituye por `0` | `coalesce(average_cost_cents, 0)` al copiar, o `coalesce` al sumar | Un costo `0` no es «no sé cuánto costó», es «me costó gratis», y **infla la utilidad bruta** justo en los productos peor registrados. Es el mismo criterio con el que 021 dejó `average_cost_cents` nullable y la pantalla de precio unitario apaga el margen (021, AC5). El `CHECK` de §5.1 lo hace además imposible de colar por debajo |
| **D-4**: Sin backfill; lo anterior a la migración queda `null` | Un `UPDATE` de relleno con el `average_cost_cents` de hoy | Ese promedio es el de las compras registradas **hasta hoy**, no el vigente cuando aquellas ventas ocurrieron, y la mayoría de productos ni siquiera lo tiene (021, §10). Rellenar produciría una utilidad histórica con aspecto de exacta y contenido inventado, que es peor que una marcada como parcial. El coste asumido —los meses pasados salen parciales para siempre— es visible en pantalla y se disuelve solo con el tiempo |
| **D-5**: El COGS importa `buildDeclarableFilter()` y le suma `related_document_id is null` | Escribir `status = 'issued' and issued_at >= … and issued_at < …` a mano, sin el join al padre | Para un original la condición (c) del filtro es inerte, sí; lo que se reutiliza es el **anclaje del período**: `status = 'issued'` y la ventana de `issued_at` con su extremo superior estricto. Copiarlas sería una tercera copia de la regla que decide en qué mes cae una venta, y el día que alguien toque el filtro el COGS se quedaría en la versión vieja **en silencio**, descuadrando contra el ingreso del que se resta. El precio es un `left join` trivialmente satisfecho contra la clave primaria |
| **D-6**: Los gastos netos se derivan por resta de dos campos que `findExpenseTotals()` ya devuelve | Una consulta nueva con `sum(case when grants_credit then amount − igv else amount end)` | Los dos números salen ya de la misma fila del mismo `SELECT` que el handler pide de todos modos, así que la consulta nueva sería un segundo escaneo para un número que se obtiene restando. Y reutilizarla garantiza por construcción que el IGV que **no** resta de la utilidad es exactamente el mismo que la card «IGV de compras» publica como crédito fiscal y que `/admin/finance/taxes` descuenta: un solo sitio decide la elegibilidad, `TAX_CREDIT_RECEIPT_TYPES` (024, D-4; 026, D-4) |
| **D-7**: La nómina es una función nueva en `finance.repository.ts` | Reutilizar `payroll-payment.repository.findMany()` y sumar en TypeScript, o poner el agregado en aquel repositorio | `findMany()` pagina y filtra por `period` (`'AAAA-MM'`), no por rango de `paid_at`: sumar sus páginas en TypeScript sería traerse la bitácora entera para un número, y filtrar por `period` mentiría en cuanto el rango elegido no sea un mes calendario. Vive en `finance.repository.ts` por el mismo precedente que `findSalesTotals()` consultando `orders`: es un agregado del resumen financiero (017, D-1; 025, §6.2) |
| **D-8**: La card «Gastos operativos» sigue mostrando el importe **registrado**; lo neto solo aparece como línea del bloque de utilidad | Cambiar la card al importe neto del IGV recuperable, para que no haya dos números | La card responde «cuánto salió de caja» y ese número es el del comprobante, el que cuadra con el banco y con la tabla de gastos de abajo. El bloque de utilidad responde «cuánto costó operar», que descuenta el IGV que vuelve como crédito. Son dos preguntas distintas y la pantalla ya publica pares así —ventas confirmadas frente a declarables (025)—; lo que hace falta es que cada rótulo diga cuál es cuál, no que una de las dos desaparezca |
| **D-9**: El guard de base no positiva vive en `profit.ts`, no dentro de `marginPercent()` | Cambiar `marginPercent()` para que devuelva `null` con base negativa | Esa función la comparte `unitMargin()` del spec 021 (`pricing-math.ts:17-34`), donde la base es el precio de venta y no puede ser negativa: cambiarla movería el comportamiento de una pantalla que no lo ha pedido, para cubrir un caso que allí no existe. Aquí el caso sí existe —un rango cuyas notas de crédito superan lo emitido— y es la misma clase de decisión que 026 tomó con la Renta de base negativa (026, D-6) |
| **D-10**: El IGV no resta en ninguno de los tres niveles; la Renta sí resta en el neto | Descontar el IGV por pagar de la utilidad neta, «porque es dinero que sale» | El IGV de ventas no es ingreso de la empresa ni el de compras es gasto suyo: la empresa lo recauda del comprador y lo traslada a SUNAT, y por eso el ingreso base de esta jerarquía es `base_cents`, **sin IGV**, desde la primera línea. Restarlo otra vez al final sería contarlo dos veces. La Renta sí es un impuesto **sobre** el resultado de la empresa, y por eso separa la utilidad operativa de la neta |
| **D-11**: `netCents` y `marginPercent` se **eliminan** del contrato | Dejarlos publicados «por compatibilidad» junto al bloque nuevo | Decisión de negocio cerrada en el brainstorming (§3): dos cifras de «ganancia» en la misma pantalla obligan a explicar cuál es la buena cada vez que alguien la mira, y la vieja pierde siempre esa comparación —es la que la propia pantalla lleva un spec entero advirtiendo que no es utilidad—. Un campo publicado que ningún componente pinta es contrato muerto que el siguiente spec tendrá que retirar igual, con más consumidores encima. Los dos son de solo lectura y no hay clientes externos |
| **D-12**: Bloque propio de ancho completo, no una sexta card | Tres cards más en la rejilla, o una card con los tres números | Los tres niveles se leen **en cascada**, con sus restas intermedias entre medias: es la forma de un estado de resultados y en tres cards sueltas se pierde justo eso —de dónde sale cada número—. El precedente del módulo es `ExpensesByCategory`, bloque propio porque es una lista; aquí es una secuencia, que necesita aún más el ancho. Sin Recharts, como todo el módulo (017, D-13) |
| **D-13**: Sin índice sobre `payroll_payments.paid_at` ni sobre `cost_cents_snapshot` | Añadirlos ahora, «que la migración ya la estamos generando» | `payroll_payments` crece un pago por empleado y mes: el seq scan de un rango es de unas decenas de filas y el índice no se pagaría nunca, mismo criterio que 024 con `expenses` y 026 con `igv_cents` (D-11). `cost_cents_snapshot` se agrega, no se filtra, así que no participaría en el plan. Que la migración esté abierta no es una razón para meter en ella algo que no se ha medido |
| **D-14**: Sin entrada de bitácora cuando una venta se registra sin costo | Un `logAudit` con `severity: 'warning'` por cada pedido con líneas sin costo | El hecho ya queda **almacenado en la propia tabla**: `cost_cents_snapshot is null` es consultable en cualquier momento y es lo que alimenta el aviso de parcial. Un registro en `audit_logs` sería una segunda copia del mismo hecho, escrita en la transacción del webhook —la más sensible al tiempo— y en una tabla que `audit` y `manager` leen íntegra. Quien necesita actuar tiene el enlace a `/admin/finance/pricing` en la pantalla |

## 9. Tareas

Orden de dependencia: esquema → migración → repositorio de escritura → servicio
→ repositorio de lectura → módulo puro → tipos → handler → copys → vista →
documentación → cierre.

- [x] **T1** — Columna `costCentsSnapshot` y el `CHECK`
      `order_items_cost_cents_snapshot_positive` según §5.1, con el comentario que
      explica por qué es nullable · archivo:
      `src/server/db/schema/order-item.ts` · verificación: `npm run typecheck`
- [x] **T2** — Generar y aplicar la migración: `npm run db:generate` y
      `npm run db:migrate`. Revisar el SQL antes de aplicarlo: debe ser un
      `ADD COLUMN` nullable sin default y el `ADD CONSTRAINT`, **sin ningún
      `UPDATE` de relleno** (D-4, AC29) · archivos: `drizzle/0013_*.sql`,
      `drizzle/meta/` · verificación: `npm run db:migrate` y el journal en `0013`
- [x] **T3** — `snapshotItemCosts(tx, orderId)` según §5.2: `update(orderItems)`
      asignando `costCentsSnapshot` desde una plantilla `sql` sobre
      `products.averageCostCents`, con `.from(products)` y el `where` de las dos
      igualdades. **Sin `coalesce`**. El archivo importa hoy `orderItems, orders,
      users` del esquema (línea 30): hay que añadirle `products` ·
      archivo: `src/server/repositories/order.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T4** — Test del SQL compilado de T3 con `PgDialect`, capturando el
      builder con un `tx` falso al estilo de `finance.repository.test.ts:200-211`:
      asigna desde `"products"."average_cost_cents"`, empareja por
      `"product_id"`, acota por `"order_id"` con el id como parámetro, y el texto
      **no contiene** `coalesce` ni el literal `0` (AC4) · archivo:
      `src/server/repositories/order.repository.test.ts` · verificación:
      `npm test`
- [x] **T5** — Llamar a `snapshotItemCosts(tx, orderId)` dentro de
      `fulfillCheckoutSession`, **entre** `decrementStockAndAudit(...)` y
      `queueOriginalDocument(...)` (§5.2), con el comentario de por qué ese
      instante y no antes · archivo:
      `src/server/services/order-fulfillment.service.ts` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T6** — `findCogsTotals()` según §5.3 y §6.2: `leftJoin` al alias
      `parentDocuments` ya existente, `innerJoin` a `order_items` por `order_id`,
      `where(and(buildDeclarableFilter(range, parentDocuments), isNull(electronicDocuments.relatedDocumentId)))`
      con el filtro **importado y no reescrito**, el producto con `::bigint` antes
      de multiplicar y el `FILTER` de líneas sin costo · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T7** — Tests del SQL compilado de T6: su `where` es byte a byte el de
      `buildDeclarableFilter` más `related_document_id is null` (mismo estilo de
      aserción que `finance.repository.test.ts:227-233`), acota `issued_at` con el
      extremo superior estricto, no menciona `"created_at"`, une `order_items` por
      `"order_id"`, castea a `bigint` antes del producto y cuenta las líneas sin
      costo con un `filter` sobre `is null` · archivo:
      `src/server/repositories/finance.repository.test.ts` · verificación:
      `npm test`
- [x] **T8** — `findPayrollTotals()` según §5.3 y §6.2: `voided_at is null` y los
      dos extremos de `paid_at` **inclusive** · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T9** — Tests del SQL compilado de T8: exige `"voided_at" is null`, acota
      `"paid_at"` con `>=` y `<=` —y **no** con `<`, que sería la ventana de los
      instantes (AC16)—, envía los dos días como parámetros y no filtra por
      `"period"` · archivo: `src/server/repositories/finance.repository.test.ts` ·
      verificación: `npm test`
- [x] **T10** — Módulo puro `buildPeriodProfit()` según §6.4, componiendo
      `marginPercent()` de `finance-math.ts` con el guard de base no positiva ·
      archivo: `src/modules/finance/lib/profit.ts` · verificación:
      `npm run typecheck`
- [x] **T11** — Tests de T10, al estilo de `rer.test.ts`, un caso por
      comportamiento: la cascada completa con números redondos; base `0` → los tres
      márgenes `null` y los tres importes calculados (AC21); base **negativa** → los
      tres márgenes `null` (AC22); COGS parcial → el importe no cambia y
      `uncostedLineCount` viaja intacto; utilidad negativa en los tres niveles;
      renta `0` → la neta iguala a la operativa; y que los tres importes son
      enteros · archivo: `src/modules/finance/lib/profit.test.ts` · verificación:
      `npm test`
- [x] **T12** — Tipos `ProfitLevel`, `CostOfGoodsSold`, `PeriodProfit` y el campo
      `profit` en `FinanceSummary`, **eliminando** `netCents` y `marginPercent`
      (AC24), con los comentarios de §6.1 · archivo:
      `src/modules/finance/types/finance.types.ts` · verificación:
      `npm run typecheck` (romperá en el handler y en la card: lo arreglan T13 y
      T17)
- [x] **T13** — El handler pasa a ocho lecturas en `Promise.all` y compone
      `profit` con `buildPeriodProfit()` según §6.3; fuera el cálculo de
      `netCents` y el import de `marginPercent` · archivo:
      `src/app/api/admin/finance/summary/route.ts` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T14** — Test del invariante del AC27 sobre `ROLE_PERMISSIONS`: todo rol con
      `finance.read` tiene también `payroll.read`, porque el resumen publica el
      total de nómina del rango · archivo: `src/lib/permissions.test.ts` ·
      verificación: `npm test`
- [x] **T15** — Copys: título del bloque, las ocho etiquetas de línea (ingresos
      netos, costo de lo vendido, utilidad bruta, gastos operativos netos, nómina,
      utilidad operativa, Renta estimada, utilidad neta), las tres etiquetas de
      signo, el aviso de COGS parcial con su enlace, la nota de que el IGV no resta
      (AC20) y la de que los gastos netos no son el importe registrado (D-8).
      **`NO_REVENUE_MESSAGE` se reutiliza, no se duplica**: hoy solo lo consume
      `NetResult`, que T17 elimina, así que sin esto queda huérfano. Su comentario
      pasa a decir «ingreso neto no positivo» y no «no hubo ingresos», porque ahora
      la base también puede ser negativa (AC22) · archivo:
      `src/modules/finance/constants.ts` · verificación: `npm run typecheck`
- [x] **T16** — Componente presentacional del bloque: recibe
      `PeriodProfit | undefined`, `isLoading`, `isError`, `message` y `onRetry`;
      pinta la cascada de §6.1 con los sustraendos entre los niveles; el signo con
      etiqueta, icono y color (AC23); el margen `null` con su copy y nunca «0 %»
      (AC21); y el aviso de parcial **solo** con `uncostedLineCount > 0`, enlazando
      a `/admin/finance/pricing` con `next/link` (AC12, AC13) · archivo:
      `src/modules/finance/components/period-profit-card.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T17** — En `finance-summary-cards.tsx`: quitar la card «Resultado del
      período» y el componente `NetResult` que se queda sin uso, devolver la
      rejilla a `sm:grid-cols-2 lg:grid-cols-4` y los esqueletos a cuatro ·
      archivo: `src/modules/finance/components/finance-summary-cards.tsx` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T18** — Montar el bloque bajo `UninvoicedOrdersNotice` y sobre
      `ExpensesByCategory`, pasándole `summary?.profit` y el mismo `isLoading`,
      `isError`, `message` y `onRetry` que el resto (AC28) · archivo:
      `src/modules/finance/components/finance-overview.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T19** — Reescribir el encabezado de la página: ya no puede decir que la
      cifra no descuenta costo, nómina ni impuestos (AC25). Debe decir qué mide
      cada nivel, que la utilidad cuelga de las ventas **declarables** mientras la
      card de confirmadas es la caja, que el COGS usa el costo promedio congelado
      y no el del lote, y que el IGV no resta · archivo:
      `src/app/(admin)/admin/finance/page.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T20** — Documentar en `docs/SETUP.md`: en §5.3, la columna nueva y la
      migración `0013`; en §6, los tres niveles, de dónde sale cada sumando y que
      `netCents` ya no existe. Corregir el párrafo de §6 que hoy dice que el costo
      «no entra todavía en el resultado de `/admin/finance`» · archivo:
      `docs/SETUP.md` · verificación: lectura
- [x] **T21** — Cierre: confirmar que `drizzle/` quedó en `0013` con **una sola**
      migración nueva, que `src/lib/permissions.ts` sigue en 29 códigos y que
      ningún archivo menciona ya `summary.netCents` · verificación:
      `npm run typecheck && npm run lint && npm test && npm run build`

## 10. Riesgos y consideraciones

- **La utilidad bruta será poco fiable durante meses, y hay que resistirse a
  arreglarlo con un número.** Hoy casi ningún producto tiene
  `average_cost_cents` (021, §10), así que los primeros rangos saldrán
  mayoritariamente parciales. Es una señal operativa —faltan compras
  registradas—, no un defecto del cálculo, y el aviso con enlace a
  `/admin/finance/pricing` es la respuesta correcta. El día que alguien proponga
  «poner cero mientras tanto», la respuesta está en D-3.
- **El COGS no baja con una devolución.** Verificado: el spec 023 no repone stock
  —`order-adjustment.service.ts` no toca `products` ni `stock_movements`—, así
  que una nota de crédito parcial reduce el ingreso del rango y deja el costo
  entero, hundiendo la utilidad bruta de ese período. Es coherente con el
  inventario (la mercadería sigue descontada), pero es una asimetría real y el
  copy no debe presentar el margen bruto de un rango con devoluciones como una
  medida limpia.
- **Ingreso y COGS no caen siempre en el mismo período.** El ingreso del rango
  incluye las notas de crédito y débito **emitidas** en él, aunque corrijan ventas
  de meses anteriores; el COGS solo incluye los originales del rango. Un mes con
  muchas correcciones de meses pasados mostrará una utilidad bruta artificialmente
  baja. Alinearlo exige el período contable de la nota, que es la deuda que 025 y
  026 ya dejaron enganchada (§11).
- **La utilidad neta arrastra las dos advertencias normativas sin verificar**: la
  tasa de 1.5 % de RER (026, §5.1.1) y la tabla de crédito fiscal (024, §5.1.1).
  La segunda entra ahora **dos veces** —en los gastos netos y en la Renta—, así
  que corregir una celda de `PURCHASE_RECEIPT_RULES` mueve la utilidad operativa
  y no solo la pantalla de impuestos. Y `expenses.igv_cents` no se recalcula hacia
  atrás (024, §10).
- **El total de nómina del período queda detrás de `finance.read`.** Hoy es
  inocuo: los únicos roles con `finance.read` son `super_admin` y `admin`, y los
  dos tienen `payroll.read` (`permissions.ts:311-316`, `341-346`). El día que
  alguien conceda `finance.read` a un rol sin `payroll.read` —`manager` o `audit`
  son los candidatos—, este endpoint le entregaría el gasto de personal agregado
  del rango. El test del AC27 convierte ese descuido en un test rojo en vez de en
  una fuga silenciosa. Es agregado y por rango: no expone el salario de nadie en
  particular, que es la línea que 018 (D-4) trazó.
- **Rendimiento.** El resumen pasa de cinco a ocho consultas en `Promise.all`,
  todas independientes y acotadas por índices existentes
  (`electronic_documents_issued_at_idx`, la PK del join al padre,
  `order_items_order_id_idx`, `expenses_incurred_on_idx`), así que el coste sigue
  siendo el de la más lenta. La única nueva con join es el COGS, y no abanica
  filas por el índice único parcial de original vigente. La nómina hace seq scan
  sobre una tabla de decenas de filas (D-13).
- **Desbordamiento.** `costo × cantidad` se castea a `bigint` **antes** del
  producto, no después: en `int4` el producto desborda antes que la suma. Las
  sumas siguen el `::bigint` + `Number()` del resto del módulo (017, D-11).
- **La correspondencia entre el ingreso y el COGS no la sostiene el typecheck**,
  sino el hecho de compartir `buildDeclarableFilter()` más los tests de T7. Si
  alguien copiara la condición en vez de importarla, el numerador y el denominador
  de la utilidad bruta podrían divergir en silencio.
- **El snapshot corre dentro de la transacción del webhook de Stripe**, que
  compite con un corte de ~10 s. Es una sentencia declarativa sobre un índice
  existente, sin red y sin lecturas previas; si algún día esa transacción se
  volviera lenta, esta es de las últimas piezas a mirar, no de las primeras.
- **Un pedido pagado y aún sin comprobante no aporta ni ingreso ni costo.** Su
  costo ya está congelado en las líneas, pero no cuenta en ningún rango hasta que
  alguien emita. El indicador de pedidos sin comprobante (025) es el que avisa, y
  ahora explica también por qué la utilidad de un mes puede parecer baja.

## 11. Fuera de alcance / deuda aceptada

- **El período contable de la nota de crédito.** Tercer spec consecutivo que la
  hereda (025, §11; 026, §11). Ahora además descuadra ingreso contra COGS (§10).
  Se retoma en el primer spec que cierre períodos, que es el primero en el que la
  diferencia deja de ser informativa.
- **Reponer stock y reducir el COGS en una devolución.** Es un cambio del spec 023
  —la nota de crédito tendría que mover inventario—, no de esta pantalla. Se
  retoma cuando alguien reporte que el margen bruto de un mes con devoluciones no
  cuadra con la realidad del almacén.
- **Costeo por lote (FIFO/LIFO).** El costo congelado es el **promedio
  ponderado** vigente, no el del lote que salió del almacén. Ya estaba fuera de
  alcance en 021 (D-1) y sigue estándolo; lo que este spec añade es que ahora esa
  aproximación llega hasta la utilidad, así que conviene que el encabezado lo diga.
- **Backfill del costo histórico** (D-4) y **utilidad por pedido, por producto o
  por categoría.** Hoy solo hay utilidad del período; el margen unitario
  potencial vive en `/admin/finance/pricing` y el realizado por venta no lo pide
  nadie todavía.
- **Comisiones de pasarela de pago como línea propia** de la cascada. Siguen
  registrándose a mano como un gasto más (017, §3). Se retoma si alguien quiere
  ver cuánto se lleva Stripe sin tener que anotarlo.
- **Cierre de período, gráficos, exportación y comparación entre rangos.** Mismo
  criterio que el resto del módulo; la comparación período contra período ya vive
  en el dashboard (015) con su propia definición de ventas.
- **Otros tributos que sí reducirían la utilidad neta** —ESSALUD sobre la nómina,
  entre otros—. Fuera de alcance en 026 (§3) y siguen fuera aquí: la utilidad neta
  de esta pantalla resta **solo** la Renta RER estimada, y el copy tiene que
  decirlo.
