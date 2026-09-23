---
id: 025
title: Ingresos v2 — ventas confirmadas y ventas declarables
status: done
module: finance
scope: admin
created: 2026-09-22
---

# 025 — Ingresos v2: ventas confirmadas y ventas declarables

## 1. Contexto

`/admin/finance` responde hoy «cuánto entró» con un solo número. Verificado en
`src/modules/finance/components/finance-summary-cards.tsx`: la primera card se
rotula **«Ingresos por ventas»** y pinta `summary.revenueCents`, que el
repositorio calcula como `sum(orders.amount_total_cents)` con
`status = 'paid'` (`findSalesTotals`, spec 017, D-10). Es el dinero cobrado por
Stripe y es el mismo número que el KPI de ventas del dashboard (spec 015).

Desde los specs 022 y 023 existe una segunda verdad sobre las mismas ventas:
`electronic_documents`, con los comprobantes que este negocio emite ante SUNAT
y sus correcciones. Las dos cifras no coinciden y no tienen por qué: la emisión
es manual (022, D-8), así que un pedido puede estar cobrado horas antes de que
su boleta exista; y una corrección posterior (023) puede anular o reducir lo
efectivamente facturado sin devolver el cobro al estado anterior.

Quien cierra un mes necesita las dos. La primera es la caja; la segunda es la
que va al Registro de Ventas. Este spec publica la segunda al lado de la
primera, sin tocar la primera.

Es el **sub-proyecto #3 del roadmap de Finanzas**
(`docs/superpowers/specs/2026-09-21-modulo-finanzas-design.md`), y su diseño
previo es `docs/superpowers/specs/2026-09-21-ingresos-v2-design.md`. Depende de
#0 (specs 022 y 023, ambos `done`) y no los modifica.

## 2. Objetivo

Una persona con `finance.read` abre `/admin/finance`, elige un rango y ve, lado
a lado, cuánto cobró (**ventas confirmadas**) y cuánto facturó ante SUNAT neto
de correcciones (**ventas declarables**), con el desglose boleta/factura y el
número de pedidos pagados que todavía no tienen comprobante emitido.

## 3. Alcance

### Incluye

- Renombrar la card «Ingresos por ventas» a **«Ventas confirmadas»**. Solo la
  etiqueta: el cálculo, el campo del contrato y el número son los de siempre.
- Card nueva **«Ventas declarables»**, calculada sobre `electronic_documents`
  filtrando por `issued_at` en el rango (§5.2).
- Desglose de ventas declarables por tipo de comprobante (boleta / factura),
  cada uno neto de **sus propias** notas de crédito y débito.
- Indicador de salud: cuántos pedidos `paid` del rango no tienen todavía un
  comprobante original `issued`, con enlace a `/admin/orders`.
- Extracción de `ORIGINAL_DOCUMENT_KINDS` al catálogo puro
  `src/lib/electronic-documents.ts` (tercera repetición, §8 D-7).

### No incluye (explícito)

- **Cambios de esquema.** Las tres columnas que el diseño pedía añadir
  (`issued_at`, `base_cents`, `igv_cents`) y el índice que sostiene el filtro
  por rango **ya existen**: el spec 022 los construyó por adelantado (§5.1).
  Este spec no genera ninguna migración.
- **Impuesto a pagar.** Solo se produce la cifra de ventas; cruzarla contra el
  IGV de compras que aporta el spec 024 es el sub-proyecto #4.
- **`base_cents` / `igv_cents` en la respuesta.** Existen en la tabla desde 022
  pero son el insumo del #4 y no se publican aquí: la card dice importes
  totales, no desglose de impuesto.
- **El KPI de ventas del dashboard** (spec 015). Sigue con su definición
  (`paid`) y su propio rango de tres períodos cerrados. Esta pantalla no lo
  toca.
- **Cambios en `netCents`, `marginPercent` ni en el desglose de gastos.** El
  resultado del período sigue restando gastos a **ventas confirmadas**, no a
  declarables: cambiarlo alteraría el significado de una cifra que ya se usa.
- **La gestión de reintentos de emisión.** Ya vive en `/admin/orders` (specs
  022 y 023). Aquí solo hay un conteo y un enlace.
- **Un filtro por estado de comprobante en `/admin/orders`.** Verificado: esa
  tabla mantiene sus filtros en `useState`, no en la URL
  (`admin-orders-table.tsx:42`), así que un enlace con query string no filtraría
  nada. Hacerlo filtrable es un cambio de aquel módulo (§11, D-11).
- **Ventas por otros canales.** Todo el proyecto asume que la única fuente de
  ventas es el checkout de Stripe.
- **Ningún permiso nuevo.** El catálogo se queda en 29 códigos.
- **Gráficos y exportación.** Mismo criterio que 017 (D-13), 021 y 024.

## 4. Criterios de aceptación

- [ ] AC1 — Dado un visitante sin sesión, cuando pide
      `GET /api/admin/finance/summary`, entonces recibe `401` con cuerpo
      `{ message }` y no un `307` al formulario de Clerk.
- [ ] AC2 — Dado un usuario con sesión y sin `finance.read`, cuando pide el
      endpoint con una query inválida, entonces recibe `403` y no `400`: la
      autorización ocurre antes de mirar la query.
- [ ] AC3 — Dada la primera card, entonces se rotula «Ventas confirmadas» y su
      importe es **exactamente el mismo** que antes de este spec:
      `sum(amount_total_cents)` de los pedidos `paid` del rango. El campo del
      contrato sigue llamándose `revenueCents`.
- [ ] AC4 — Dadas las ventas declarables, entonces el rango se aplica sobre
      `electronic_documents.issued_at` y nunca sobre `created_at`, `updated_at`
      ni `orders.created_at`.
- [ ] AC5 — Dada una boleta `issued` con `issued_at` dentro del rango, entonces
      su `amount_cents` suma a ventas declarables y a la fila «boleta» del
      desglose.
- [ ] AC6 — Dado un comprobante original en estado `voided`, entonces **no**
      suma, aunque conserve su `issued_at` dentro del rango.
- [ ] AC7 — Dada una `comunicacion_baja` emitida, entonces ni suma ni resta: al
      dejar `voided` a su padre, el padre deja de contar y ella queda fuera por
      la misma regla, sin ninguna resta de importe.
- [ ] AC8 — Dada una nota de crédito **no anulatoria** (devolución parcial,
      motivos 04, 07 o 09), entonces su importe se resta y su original sigue
      sumando: el resultado es la venta menos lo devuelto.
- [ ] AC9 — Dada una nota de crédito **anulatoria** (motivos 01, 06, 02 o 03,
      que dejan `voided` al original), entonces la nota **no se resta**: la venta
      sale del cálculo por el lado del original y ese comprobante nunca aporta un
      importe negativo a las ventas declarables.
- [ ] AC10 — Dada una corrección de comprador —original anulado, nota de crédito
      emitida y comprobante reemitido ya `issued`—, entonces la venta cuenta
      **una sola vez**, por el importe del comprobante reemitido.
- [ ] AC11 — Dada una nota de débito `issued` sobre un original que sigue
      `issued`, entonces su importe **suma**; si el original quedó `voided`, no
      suma.
- [ ] AC12 — Dada una nota de crédito de una factura, entonces se descuenta del
      total de **facturas** y nunca del de boletas: cada fila del desglose es
      neta de sus propias correcciones.
- [ ] AC13 — Dado el desglose, entonces `declarableSales.amountCents` es
      exactamente la suma de `byKind[].amountCents`, por construcción y no por
      coincidencia.
- [ ] AC14 — Dado un rango sin ningún comprobante emitido, entonces las ventas
      declarables muestran `S/ 0.00` con su copy de estado vacío y el desglose su
      estado vacío. **No es un error ni un estado de carga.**
- [ ] AC15 — Dado un rango con pedidos pagados sin comprobante emitido, entonces
      bajo las cards aparece el conteo con enlace a `/admin/orders`; con cero, la
      línea no se pinta.
- [ ] AC16 — Dado un pedido `paid` cuyo comprobante está `pending` o `failed`,
      entonces cuenta en el indicador; si está `issued`, no cuenta.
- [ ] AC17 — Dado un pedido `paid` cuyo original quedó `voided` y cuyo
      comprobante reemitido sigue `pending`, entonces cuenta en el indicador: ese
      pedido no tiene hoy comprobante vigente ante SUNAT.
- [ ] AC18 — Dado un filtro de categoría aplicado en la tabla de gastos,
      entonces ninguna de las dos cifras de ventas cambia, igual que el resto del
      resumen (017, D-17).
- [ ] AC19 — Dado cualquier importe del JSON del endpoint, entonces es un entero
      en céntimos; la división por 100 solo ocurre en el formateo de la vista.
- [ ] AC20 — Dado el catálogo de permisos, entonces sigue en 29 códigos y toda
      la pantalla sigue detrás de `finance.read`.
- [ ] AC21 — Dado el directorio `drizzle/`, entonces al terminar este spec el
      journal **sigue en `0012_careful_cargill`**: no se genera ninguna
      migración.
- [ ] AC22 — Dada la primera carga, entonces las cinco cards muestran
      esqueletos; ante un fallo de red, el bloque muestra su mensaje con
      «Reintentar».

## 5. Modelo de datos

**Sin cambios de esquema. Sin migración.** Es la primera sección que hay que
leer al aprobar, porque el documento de diseño decía lo contrario.

### 5.1 Lo que el diseño pedía añadir y ya existe

El §4 del documento de brainstorming pedía añadir `issued_at` a
`electronic_documents` como parte de este sub-proyecto. Verificado contra
`src/server/db/schema/electronic-document.ts` y contra el SQL aplicado: **las
tres columnas y los dos índices que este spec necesita ya están construidos**,
creados por adelantado en el spec 022 (migración `0010_tough_mimic`) para no
tener que volver a migrar al llegar aquí.

| Pieza | Dónde | Estado |
|---|---|---|
| `issued_at timestamptz` | `electronic-document.ts:77` | Existe. El comentario cita expresamente «exigida por #3 (Ingresos v2)» |
| `base_cents`, `igv_cents` | `electronic-document.ts:69-70` | Existen. Son insumo del #4; este spec no los publica |
| `electronic_documents_issued_at_idx` | `0010_tough_mimic.sql:62` — `btree (issued_at desc nulls last)` | Existe. Sostiene el filtro por rango de §5.2 |
| `electronic_documents_order_id_idx` | `0010_tough_mimic.sql` | Existe. Sostiene el `NOT EXISTS` del indicador de salud (§5.3) |

Tampoco hace falta un índice sobre `related_document_id`: el auto-join de §5.2
lo recorre en el sentido contrario —del hijo al padre por `p.id`—, así que el
lado indexado es la clave primaria.

Dos invariantes de la tabla que el cálculo da por buenos y que están en la base,
no solo en el código:

- `CHECK electronic_documents_issued_at_matches_status` —
  `(status in ('issued','voided')) = (issued_at is not null)`. Un documento
  emitido tiene siempre fecha, y un anulado **conserva la suya**: `markVoided`
  no toca `issued_at` a propósito, porque un documento anulado sí se emitió y su
  período sigue siendo el suyo.
- `CHECK electronic_documents_original_has_no_parent` —
  `(kind in ('boleta','factura')) = (related_document_id is null)`. Es lo que
  permite distinguir original de corrección por la estructura del árbol y no por
  una lista de `kind` repetida en cada `WHERE`.

### 5.2 Punto que se aparta del diseño aprobado — la fórmula de §5 está incompleta

> **Esto hay que confirmarlo o rechazarlo al aprobar.** Se señala aquí, y no
> enterrado en las decisiones técnicas, con el mismo mecanismo con el que el
> spec 024 señaló su §5.1: es el único punto en el que este spec contradice la
> letra del documento de brainstorming.

El diseño (§5) propone esta fórmula:

```
ventasDeclarables =
    sum(amount_cents WHERE kind IN ('boleta','factura') AND status = 'issued')
  − sum(amount_cents WHERE kind = 'nota_credito'      AND status = 'issued')
  + sum(amount_cents WHERE kind = 'nota_debito'        AND status = 'issued')
```

y razona aparte que la `comunicacion_baja` no resta porque ya deja `voided` al
original. Ese razonamiento es correcto, pero **la baja no es el único documento
que anula a su padre**. Verificado en
`src/modules/invoicing/lib/adjustment.ts:82-90`:

```ts
export function voidsParent(document: { kind; reasonCode }): boolean {
  if (document.kind === 'comunicacion_baja') return true;
  if (document.kind !== 'nota_credito') return false;

  return document.reasonCode !== null && VOIDING_CREDIT_NOTE_REASONS.has(document.reasonCode);
}
```

donde `VOIDING_CREDIT_NOTE_REASONS` se deriva de
`REASONS_BY_INTENT.anulacion_total` (01, 06) y
`REASONS_BY_INTENT.correccion_comprador` (02, 03). Y en
`src/server/services/electronic-document.service.ts:386-413`,
`voidParentAndReissue()` ejecuta ese `markVoided` **dentro de la misma
transacción** que el `markIssued` de la nota.

Es decir: **una nota de crédito con motivo 01, 06, 02 o 03 deja `voided` al
original**. Aplicando la fórmula del diseño a los cinco caminos de ajuste que
existen (spec 023):

| Camino | Documentos resultantes | Fórmula del diseño | Correcto |
|---|---|---|---|
| Anulación total, dentro de ventana | baja `issued` + original `voided` | `0` | `0` ✓ |
| Anulación total, fuera de ventana | NC (01/06) `issued` + original `voided` | **`−importe`** | `0` ✗ |
| Corrección de comprador | NC (02/03) + original `voided` + reemitido `issued` | **`0`** | `+importe` ✗ |
| Devolución parcial | NC (04/07/09) + original sigue `issued` | `venta − devuelto` | ✓ |
| Cargo adicional | ND + original sigue `issued` | `venta + cargo` | ✓ |

Dos de los cinco caminos dan un número falso, y uno de ellos produce **ventas
declarables negativas** por una venta anulada. No es un matiz: la anulación
total fuera de ventana es el camino frecuente en cuanto pasan unos días.

**Regla que se implementa en su lugar** — una sola, positiva y sin lista de
motivos:

> Un documento cuenta cuando (a) está `issued`, (b) su `issued_at` cae en el
> rango y (c) **la venta que documenta sigue contando**: es un original, o su
> padre sigue `issued`.
>
> El signo lo da el `kind`: original `+`, `nota_credito` `−`, `nota_debito` `+`.

Comprobada contra los cinco caminos, da la columna «Correcto» de la tabla. La
`comunicacion_baja` sale sola del cálculo —su padre siempre queda `voided` al
emitirse ella—, que es exactamente lo que el diseño pedía, sin tratarla como un
caso especial. Y no depende de los códigos de motivo: si el spec 023 cambiara
qué motivos anulan, esta consulta sigue siendo correcta sin tocarla.

### 5.3 Reglas de cálculo (normativas)

**Rango.** El mismo `ResolvedFinanceRange` que ya produce
`resolveFinanceRange()` (017): días inclusivos `[fromDay, toDay]` en
`America/Lima`, traducidos a la ventana semiabierta de instantes `[from, to)`.
`issued_at` es `timestamptz`, así que usa esa ventana igual que
`orders.created_at`:

```
orders              : created_at >= from AND created_at < to     (ya existe)
expenses            : incurred_on >= fromDay AND <= toDay        (ya existe)
electronic_documents: issued_at  >= from AND issued_at  < to     (nuevo)
```

Los tres derivan del mismo par de días, así que es imposible que una cifra
cuente un día que otra no.

**Ventas confirmadas.** Sin cambios: `sum(orders.amount_total_cents)` con
`status = 'paid'`, envío incluido (017, D-10).

**Ventas declarables.** Una sola consulta con auto-join al padre, agrupada por
familia de comprobante:

```sql
select
  coalesce(p.kind, d.kind)                      as family,
  coalesce(sum(case when d.kind = 'nota_credito'
                    then -d.amount_cents
                    else  d.amount_cents end), 0)::bigint as amount_cents,
  count(*) filter (where d.related_document_id is null)::int     as document_count,
  count(*) filter (where d.related_document_id is not null)::int as adjustment_count
from electronic_documents d
left join electronic_documents p on p.id = d.related_document_id
where d.status = 'issued'
  and d.issued_at >= $from
  and d.issued_at <  $to
  and (d.related_document_id is null or p.status = 'issued')
group by 1
order by 1
```

- **`family`** es la del padre cuando lo hay: una nota de crédito de una factura
  descuenta de facturas, no de boletas (AC12). Solo puede valer `boleta` o
  `factura`, porque solo esos dos `kind` carecen de padre.
- **`group by 1` / `order by 1`, por ordinal y no repitiendo la expresión.** Es
  la precaución que el propio `finance.repository.ts` dejó escrita tras el
  `42803` del spec 015: en cuanto entra un `coalesce` o un `case` en el
  `SELECT`, se agrupa por ordinal.
- **`comunicacion_baja`** no necesita cláusula propia: su padre está `voided`,
  así que la condición (c) la deja fuera. Y aunque se colara, su `amount_cents`
  es `null` por `CHECK` y no aportaría nada a la suma.
- El orden de enum de Postgres pone `boleta` antes que `factura`, así que el
  desglose sale siempre en el mismo orden sin un `CASE` de ordenación.
- Solo aparecen las familias con al menos una fila contada, igual que
  `expensesByCategory`: una fila «factura S/ 0.00» diría que se facturó cero,
  no que no hubo facturas.

**Total.** `declarableSales.amountCents` se deriva en el handler **sumando el
desglose**, no con una segunda consulta: así es imposible que el total y sus
partes discrepen (AC13). Mismo mecanismo que la resta con la que el spec 024
deriva `nonCreditableCents` (024, D-9).

**Indicador de salud.** Pedidos cobrados del rango sin comprobante vigente:

```sql
select count(*)::int
from orders o
where o.status = 'paid'
  and o.created_at >= $from and o.created_at < $to
  and not exists (
    select 1 from electronic_documents d
    where d.order_id = o.id
      and d.related_document_id is null
      and d.status = 'issued'
  )
```

El `NOT EXISTS` mira «original `issued`», así que un pedido cuyo comprobante
quedó `voided` y cuyo reemitido sigue `pending` cuenta como pendiente (AC17),
que es la verdad: hoy no tiene comprobante ante SUNAT.

## 6. Contratos de API

Ninguna ruta nueva. Un endpoint gana un campo.

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/finance/summary` | `finance.read` | query: `from?`, `to?` | `FinanceSummaryResponse` **+ `data.declarableSales`** | 400, 401, 403, 500 |

Sin cambios en el schema Zod de entrada: `financeRangeSchema` ya cubre el rango
y este spec no añade ningún parámetro. Un rango vacío sigue siendo `200` con
ceros, nunca `404` (AC14).

### 6.1 Tipos de salida — `src/modules/finance/types/finance.types.ts`

```ts
import type { OriginalDocumentKind } from '@/lib/electronic-documents';

// Una fila por familia de comprobante, neta de **sus propias** correcciones: la nota de
// crédito de una factura no descuenta del total de boletas (AC12).
export type DeclarableSalesByKind = {
  kind: OriginalDocumentKind; // 'boleta' | 'factura'
  /** Originales menos notas de crédito más notas de débito, en céntimos. */
  amountCents: number;
  /** Comprobantes originales contados. */
  documentCount: number;
  /** Notas de crédito y débito contadas. Explica por qué el neto no es el bruto. */
  adjustmentCount: number;
};

export type DeclarableSales = {
  /** Suma exacta de `byKind[].amountCents`: se deriva de ellas, no de otra consulta. */
  amountCents: number;
  /** Solo las familias con al menos un documento contado, `boleta` antes que `factura`. */
  byKind: DeclarableSalesByKind[];
  /**
   * Pedidos `paid` del rango sin comprobante original `issued`. Es la brecha entre las
   * dos cifras, no un error: la emisión es manual (022, D-8).
   */
  uninvoicedOrderCount: number;
};

export type FinanceSummary = {
  /**
   * Ventas **confirmadas**: lo cobrado. El nombre del campo no cambia en este spec —solo
   * la etiqueta de la card— porque renombrarlo tocaría service, hook y componentes sin
   * mover un solo número (D-3).
   */
  revenueCents: number;
  // … orderCount, expensesCents, expenseCount, netCents, marginPercent,
  //   expensesByCategory, purchaseIgv: sin cambios …

  /**
   * Ventas **declarables**. Cifra aparte y no un reemplazo: `netCents` y `marginPercent`
   * siguen restando los gastos a `revenueCents` y dicen exactamente lo que decían (§3).
   */
  declarableSales: DeclarableSales;
};
```

`FinanceSummaryResponse` y su `meta` no cambian.

### 6.2 Firmas del repositorio — `src/server/repositories/finance.repository.ts`

```ts
// Exportado para compilarlo con `PgDialect` y probarlo sin base de datos: es la pieza con
// la regla de §5.2, y equivocarse aquí es declarar ventas que no existen.
export function buildDeclarableFilter(range: InstantRange, parent: ParentAlias): SQL;

export type DeclarableSalesTotals = DeclarableSalesByKind[];

/** Una sola consulta con auto-join; devuelve el desglose, del que el handler deriva el total. */
export async function findDeclarableSalesByKind(
  range: InstantRange,
  reader?: Reader,
): Promise<DeclarableSalesTotals>;

/** Pedidos `paid` del rango sin comprobante original `issued` (§5.3). */
export async function findUninvoicedPaidOrderCount(
  range: InstantRange,
  reader?: Reader,
): Promise<number>;
```

Las dos viven en `finance.repository.ts` y no en
`electronic-document.repository.ts` por la misma razón que `findSalesTotals()`
consulta `orders` desde aquí: son agregados del resumen financiero, no lecturas
del módulo de facturación (017, D-1). Y ninguna admite `category`: la firma es
lo que hace imposible colar el filtro del detalle en el resultado del período
(AC18).

### 6.3 Forma del handler

```ts
// src/app/api/admin/finance/summary/route.ts — solo lo que cambia
const [sales, expenseTotals, byCategory, declarableByKind, uninvoicedOrderCount] =
  await Promise.all([
    financeRepository.findSalesTotals(range),
    financeRepository.findExpenseTotals(range),
    financeRepository.findExpenseTotalsByCategory(range),
    financeRepository.findDeclarableSalesByKind(range),
    financeRepository.findUninvoicedPaidOrderCount(range),
  ]);

// El total se **deriva del desglose** con una suma entera: es imposible que discrepen
// (AC13). Misma técnica que la resta con la que 024 deriva `nonCreditableCents`.
const declarableSales: DeclarableSales = {
  amountCents: declarableByKind.reduce((total, row) => total + row.amountCents, 0),
  byKind: declarableByKind,
  uninvoicedOrderCount,
};
```

Cinco lecturas en paralelo en vez de tres: son independientes y fijas, así que
el coste sigue siendo el de la más lenta y no la suma (015, D-5).

## 7. Arquitectura y archivos afectados

- `src/lib/electronic-documents.ts` — **exporta** `ORIGINAL_DOCUMENT_KINDS` y
  deriva de ahí `isOriginalKind()` (D-7).
- `src/server/repositories/electronic-document.repository.ts` — su
  `ORIGINAL_KINDS` privado pasa a importarse del catálogo. Sin cambios de
  comportamiento.
- `src/modules/finance/types/finance.types.ts` — `DeclarableSalesByKind`,
  `DeclarableSales` y el campo nuevo de `FinanceSummary`.
- `src/server/repositories/finance.repository.ts` + `.test.ts` —
  `buildDeclarableFilter()`, `findDeclarableSalesByKind()` y
  `findUninvoicedPaidOrderCount()`.
- `src/app/api/admin/finance/summary/route.ts` — dos lecturas más en el
  `Promise.all` y la derivación del total.
- `src/modules/finance/constants.ts` — copys de las dos cards, del desglose y
  del indicador.
- `src/modules/finance/components/finance-summary-cards.tsx` — rótulo «Ventas
  confirmadas», card «Ventas declarables» con su desglose, rejilla y esqueletos
  de cinco.
- `src/modules/finance/components/uninvoiced-orders-notice.tsx` — **nuevo**: la
  línea con el conteo y el enlace.
- `src/modules/finance/components/finance-overview.tsx` — monta el indicador
  bajo las cards.
- `src/app/(admin)/admin/finance/page.tsx` — una línea en el encabezado que
  explica por qué hay dos cifras de ventas.
- `docs/SETUP.md` — §6, módulo financiero.

**Sin cambios**, y conviene escribirlo para que no se toquen: el service
(`finance.service.ts`), los hooks, `finance-range.ts`, `finance-math.ts`,
`expenses-by-category.tsx`, toda la tabla de gastos, `src/lib/permissions.ts`,
`src/server/db/schema/` y `drizzle/`. El campo nuevo viaja solo en cuanto
cambia el tipo de la respuesta.

Flujo, capa por capa, sin saltos:

```
FinanceOverview ("use client")
  → useFinanceSummary (TanStack Query)
    → finance.service (axios)
      → /api/admin/finance/summary   (authorize → Zod → derivación entera)
        → finance.repository (Drizzle) → Neon
```

Ningún componente importa `db`, Drizzle ni el repositorio.
`uninvoiced-orders-notice.tsx` recibe el conteo por props y no consulta nada.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: Un documento cuenta si su padre sigue `issued`; el signo lo da el `kind` | La fórmula del diseño: restar **toda** nota de crédito `issued` | Verificado en `adjustment.ts:82-90` y `electronic-document.service.ts:386-413`: una nota de crédito con motivo 01, 06, 02 o 03 deja `voided` al original en la misma transacción en que se emite. Con la fórmula del diseño, una anulación total fuera de ventana declara **ventas negativas** y una corrección de comprador declara cero (§5.2). La regla del padre da el número correcto en los cinco caminos, absorbe la `comunicacion_baja` sin tratarla aparte y no depende de la lista de motivos: si 023 cambiara qué motivos anulan, esta consulta sigue valiendo |
| **D-2**: El parentesco se lee de `related_document_id`, no de la serie | Deducir la familia de la letra de la serie (`B…` boleta, `F…` factura), que SUNAT obliga a compartir | La letra es una convención de impresión y `DOCUMENT_SERIES_KEYS` la mantiene por otra razón —cada combinación lleva su correlativo—, pero la relación real está en la columna y el `CHECK electronic_documents_original_has_no_parent` la garantiza en la base. Parsear la serie sería derivar un hecho estructural de una cadena de texto, y dejaría de funcionar el día que entre una serie `E…` |
| **D-3**: `revenueCents` conserva su nombre; solo cambia la etiqueta de la card | Renombrarlo a `confirmedSalesCents` en todo el contrato | El número no cambia, así que el rename movería el tipo, el handler, el repositorio, el service, el hook y dos componentes para no alterar un solo céntimo, y rompería cualquier caché de TanStack Query en vuelo durante el despliegue. La etiqueta de la card es lo que lee una persona; el campo lo lee el código, y su comentario ya dice qué significa. Si algún día el módulo se reescribe, el rename es un cambio mecánico |
| **D-4**: El desglose sale con `group by` por familia y el total se **deriva sumándolo** | Una consulta para el total y otra para el desglose | Dos consultas sobre el mismo rango son dos escaneos para números que por definición no pueden divergir, y si divergieran —por un filtro que se actualiza en una y no en la otra— la pantalla mostraría un total que no cuadra con sus partes. Derivar con una suma entera lo hace imposible (AC13). Es el mismo mecanismo con el que 024 deriva `nonCreditableCents` (D-9) |
| **D-5**: `group by 1` / `order by 1`, por ordinal | `group by coalesce(p.kind, d.kind)` repitiendo la expresión, o reutilizando una plantilla `sql` entre cláusulas | Es la precaución que `finance.repository.ts` ya dejó escrita en el comentario de `findExpenseTotalsByCategory`: reutilizar una plantilla `sql` entre `SELECT` y `GROUP BY` es la condición exacta que produjo el `42803` del spec 015. Con un `coalesce` en el `SELECT`, el ordinal es la forma que no puede desalinearse |
| **D-6**: El indicador de salud es una función de repositorio aparte, no un `FILTER` más dentro de `findSalesTotals()` | Añadirle un `LEFT JOIN` a `electronic_documents` y contar con `filter (where doc.id is null)`, como 024 hizo con el IGV (D-9) | Allí los agregados salían de las mismas filas con el mismo `WHERE`; aquí haría falta un join, y un join en la consulta que calcula `sum(amount_total_cents)` abre la puerta a que un día un cambio de condición duplique filas y **falsee las ventas confirmadas**. Hoy el índice único parcial de original vigente lo impediría, pero el riesgo no compensa: es la cifra más mirada del panel. Como consulta aparte entra en el `Promise.all` y no cuesta latencia |
| **D-7**: `ORIGINAL_DOCUMENT_KINDS` se exporta del catálogo puro | Dejar cada consumidor con su propia tupla `['boleta','factura']` | Sería la **tercera** copia: la privada de `electronic-document.repository.ts:244`, la de este spec y la que ya está implícita en `isOriginalKind()`. La regla del proyecto es extraer exactamente a la tercera (CLAUDE.md §6), y el catálogo es donde el spec 022 puso la fuente de verdad de la que el `pgEnum` se construye. `isOriginalKind()` pasa a derivarse de la tupla, así que las dos formas de preguntar lo mismo no pueden separarse |
| **D-8**: El desglose se pinta dentro de la card «Ventas declarables», no en una card de ancho completo | Un bloque propio al estilo de `ExpensesByCategory` | Son como mucho **dos** filas, y un `Card` entero con un título para dos barras es más cromo que información. El precedente inmediato es `PurchaseIgvFooter` (024): un pie de card con su propio detalle, en el mismo archivo. `ExpensesByCategory` tiene bloque propio porque son hasta ocho categorías |
| **D-9**: Las cards pasan a `sm:grid-cols-2 lg:grid-cols-3` en vez de `lg:grid-cols-4` | Mantener cuatro columnas y dejar que la quinta caiga sola, o pasar a `lg:grid-cols-5` | Con cinco cards, cuatro columnas dejan una card suelta y desalineada en la segunda fila; cinco columnas dan ~200 px por card, insuficientes para `S/ 1,234,567.89` en `text-2xl` sin que el importe se corte. Tres columnas reparten 3+2, mantienen legible el importe y dejan a «Ventas confirmadas» y «Ventas declarables» juntas en la primera fila, que es lo que el diseño pide comparar de un vistazo |
| **D-10**: `netCents` y `marginPercent` siguen calculándose sobre ventas **confirmadas** | Recalcularlos sobre declarables, o publicar un segundo resultado | El resultado del período ya significa algo y hay gente leyéndolo; cambiarle la base en silencio movería una cifra sin que nadie lo pidiera. Un segundo resultado obligaría a explicar dos márgenes en la misma pantalla para responder una pregunta que nadie ha hecho. Alinear utilidad con lo declarado es explícitamente el sub-proyecto #5 (Ganancias v2), no este |
| **D-11**: El enlace del indicador apunta a `/admin/orders` a secas | `/admin/orders?status=paid&…`, que era lo que sugería el diseño | Verificado en `admin-orders-table.tsx:42`: aquella tabla guarda sus filtros en `useState` y no lee la URL, así que una query string no filtraría nada y el enlace prometería algo que no pasa. Hacerla filtrable por URL es un cambio de aquel módulo —con su frontera de Suspense por `useSearchParams`— y no cabe en un spec cuyo alcance es «no duplicar la gestión de reintentos». Queda en §11 |
| **D-12**: El indicador no se pinta cuando el conteo es cero | Pintar «0 pedidos pendientes» siempre | Una línea permanente que casi siempre dice cero se convierte en ruido que se deja de leer, que es justo lo contrario de lo que un indicador de salud tiene que conseguir. Cuando aparece, aparece porque hay algo que hacer |
| **D-13**: `base_cents` e `igv_cents` no se publican, aunque existan en la tabla desde 022 | Publicarlos ya, «que no cuesta nada» | Cuestan: cada campo publicado es contrato que alguien consume y que después no se puede retirar sin romperlo. Son el insumo del sub-proyecto #4, que decidirá cómo se agregan y con qué etiqueta; adelantarlo aquí es fijar esa decisión desde la pantalla equivocada. El mismo criterio con el que `electronic-document.repository.ts` los dejó fuera de `ROW_COLUMNS` (022, AC22) |

## 9. Tareas

Orden de dependencia: catálogo → tipos → repositorio → tests → handler → copys
→ vista → documentación → cierre.

- [x] **T1** — Exportar `ORIGINAL_DOCUMENT_KINDS` (tupla `as const` con
      `'boleta'`, `'factura'`), derivar de ella el tipo `OriginalDocumentKind` y
      reescribir `isOriginalKind()` como una comprobación sobre la tupla;
      sustituir el `ORIGINAL_KINDS` privado de
      `electronic-document.repository.ts` por el import del catálogo · archivos:
      `src/lib/electronic-documents.ts`,
      `src/server/repositories/electronic-document.repository.ts` ·
      verificación: `npm run typecheck && npm test`
      · nota: los dos archivos en una sola tarea por lo mismo que el T5 del spec
      017: exportar la tupla y dejar la copia privada viva es no haber hecho el
      cambio
- [x] **T2** — Tipos `DeclarableSalesByKind`, `DeclarableSales` y el campo
      `declarableSales` en `FinanceSummary`, con los comentarios de §6.1 ·
      archivo: `src/modules/finance/types/finance.types.ts` · verificación:
      `npm run typecheck`
- [x] **T3** — `buildDeclarableFilter()` y `findDeclarableSalesByKind()` según
      §5.3: alias del padre con `alias()`, `leftJoin` por
      `p.id = d.related_document_id`, el `CASE` del signo, los dos `FILTER` de
      conteo y `group by 1 / order by 1` · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T4** — Tests de `buildDeclarableFilter` con `PgDialect`, siguiendo el
      patrón ya establecido en `finance.repository.test.ts`: el filtro acota los
      dos extremos de `issued_at` y el superior es **estricto** (`<`, no `<=`);
      exige `status = 'issued'`; contiene la disyunción
      «sin padre **o** padre `issued`»; los dos instantes viajan como parámetros
      y no incrustados en el texto; y el SQL compilado de
      `findDeclarableSalesByKind` agrupa por ordinal y no por la expresión ·
      archivo: `src/server/repositories/finance.repository.test.ts` ·
      verificación: `npm test`
- [x] **T5** — `findUninvoicedPaidOrderCount()` según §5.3, con el `NOT EXISTS`
      sobre originales `issued` · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [x] **T6** — Tests del SQL compilado de T5: filtra `status = 'paid'`, acota
      `created_at` con la ventana semiabierta, usa `not exists` y su subconsulta
      exige `related_document_id is null` y `status = 'issued'` · archivo:
      `src/server/repositories/finance.repository.test.ts` · verificación:
      `npm test`
- [x] **T7** — El handler pasa a cinco lecturas en paralelo y deriva
      `declarableSales.amountCents` sumando el desglose (§6.3) · archivo:
      `src/app/api/admin/finance/summary/route.ts` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T8** — Copys nuevos en `constants.ts`: títulos de las dos cards,
      etiquetas del desglose, estado vacío de ventas declarables, texto del
      indicador de salud y la nota informativa del encabezado · archivo:
      `src/modules/finance/constants.ts` · verificación: `npm run typecheck`
- [x] **T9** — En `finance-summary-cards.tsx`: rotular la primera card «Ventas
      confirmadas», añadir la card «Ventas declarables» con un
      `DeclarableSalesFooter` local —dos barras de ancho porcentual en CSS, sin
      Recharts, al estilo de `ExpensesByCategory`—, pasar la rejilla a
      `sm:grid-cols-2 lg:grid-cols-3` y los esqueletos de cuatro a cinco ·
      archivo: `src/modules/finance/components/finance-summary-cards.tsx` ·
      verificación: `npm run typecheck && npm run lint`
- [x] **T10** — Componente del indicador de salud: recibe el conteo por props,
      no pinta nada cuando es cero y enlaza a `/admin/orders` con `next/link` ·
      archivo:
      `src/modules/finance/components/uninvoiced-orders-notice.tsx` ·
      verificación: `npm run typecheck`
- [x] **T11** — Montar el indicador bajo las cards, pasándole
      `summary?.declarableSales.uninvoicedOrderCount` · archivo:
      `src/modules/finance/components/finance-overview.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [x] **T12** — Línea en el encabezado que explique por qué hay dos cifras de
      ventas y en qué se diferencian · archivo:
      `src/app/(admin)/admin/finance/page.tsx` · verificación:
      `npm run typecheck`
- [x] **T13** — Documentar en `docs/SETUP.md` §6 que el módulo financiero
      publica ahora ventas declarables, **sin** tocar §5.3: no hay cambio de
      esquema que registrar · archivo: `docs/SETUP.md` · verificación: lectura
- [x] **T14** — Cierre: confirmar que `drizzle/` sigue en
      `0012_careful_cargill` y que no se generó ninguna migración (AC21) ·
      verificación: `npm run typecheck && npm run lint && npm test && npm run build`

## 10. Riesgos y consideraciones

- **El período de una venta puede cambiar hacia atrás.** Si una nota de crédito
  anulatoria de octubre deja `voided` un original de septiembre, las ventas
  declarables de septiembre bajan al recargar la pantalla, aunque septiembre
  «ya estuviera cerrado». Es consecuencia directa de que el spec 023 marque
  `voided` al original también por nota de crédito, y de la decisión ya aprobada
  de que un original anulado no cuente. Contablemente lo discutible es el caso
  de la nota de crédito —SUNAT la registra en **su** período, restando allí,
  mientras que la comunicación de baja sí saca el original del período
  original—; corregirlo exigiría dejar de anular el padre por nota de crédito,
  que es un cambio del modelo de 023 y no de esta pantalla. Queda en §11 con su
  enganche.
- **Las dos cifras casi nunca coincidirán, y eso no es un fallo.** Difieren por
  la ventana de emisión manual (indicador de salud), por las correcciones y
  porque un pedido cobrado el 30 puede emitirse el 1. El encabezado y los copys
  tienen que decirlo, porque el primer instinto ante dos números distintos es
  pensar que uno está mal.
- **Un pedido `paid` sin comprobante nunca caduca solo.** El indicador cuenta,
  no resuelve. Si el número crece mes a mes, el problema está en que nadie está
  emitiendo desde `/admin/orders`, no en esta pantalla.
- **Rendimiento.** Una consulta más con auto-join y otra con `NOT EXISTS`,
  ambas acotadas por índices que ya existen
  (`electronic_documents_issued_at_idx` para el rango,
  la PK para el join al padre, `electronic_documents_order_id_idx` para el
  `NOT EXISTS`). Sin N+1: el desglose y sus correcciones salen de una sola
  pasada. Las cinco lecturas del handler son independientes y van en
  `Promise.all`, así que el coste es el de la más lenta.
- **Desbordamiento.** Las sumas se castean a `::bigint` y se convierten con
  `Number()`, como el resto del módulo (017, D-11): `sum(amount_cents)` en
  `int4` desborda a partir de ~21,5 M PEN acumulados, y aquí además la suma
  lleva signo, así que un `CASE` negativo sobre `int4` tiene el mismo problema
  por el otro extremo.
- **La regla de §5.2 vive en SQL y no en una función pura compartida.** No se
  puede reutilizar `voidsParent()` desde el repositorio porque la consulta no
  decide por motivo sino por el estado real del padre —que es más robusto—,
  pero eso significa que la correspondencia entre las dos piezas no la sostiene
  el typecheck, sino los tests de T4 y los criterios AC7 a AC11. Está aceptado:
  la alternativa era exportar la lista de motivos anulatorios y duplicar la
  regla en SQL, que es peor.
- **El desglose oculta las familias sin filas.** Un rango en el que solo hubo
  boletas muestra una sola barra. Es deliberado y es el mismo criterio que
  `expensesByCategory`, pero conviene que el copy del estado vacío no sugiera
  que faltan datos.

## 11. Fuera de alcance / deuda aceptada

- **El período contable de una nota de crédito.** Hoy una nota anulatoria saca
  la venta del período del original en vez de restar en el suyo (§10). Se
  retoma cuando el sub-proyecto #4 (Impuestos) tenga que producir un Registro
  de Ventas por período cerrado, que es el primer momento en que la diferencia
  importa de verdad; hasta entonces la cifra es correcta como saldo vivo.
- **Filtros por URL en `/admin/orders`.** Mientras aquella tabla guarde sus
  filtros en `useState`, ningún enlace podrá llevar a «los pedidos pagados sin
  comprobante». Se retoma cuando haya una segunda pantalla que quiera enlazar a
  un listado de pedidos filtrado; con una sola, el enlace a secas basta (D-11).
- **`base_cents` e `igv_cents` en la respuesta.** Existen en la tabla desde el
  spec 022 y son el insumo del IGV de ventas. Los publica el sub-proyecto #4,
  que es quien decide cómo se agregan (D-13).
- **Alinear el resultado del período y el margen con lo declarado.** Es el
  sub-proyecto #5 (Ganancias v2). Aquí `netCents` sigue restando los gastos a
  las ventas confirmadas (D-10).
- **El KPI de ventas del dashboard** (spec 015) sigue con su propia definición.
  Se retomaría solo si alguien reporta que las dos pantallas se contradicen, y
  la respuesta probablemente sea rotular mejor el dashboard, no recalcularlo.
- **Ventas declarables por moneda, por serie o por vendedor**, y exportación
  del Registro de Ventas a CSV. Nada de esto se pide todavía.
