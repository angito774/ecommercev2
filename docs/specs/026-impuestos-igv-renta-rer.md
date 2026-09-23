---
id: 026
title: Impuestos — IGV por pagar y Renta RER estimada
status: approved
module: finance
scope: admin
created: 2026-09-23
---

# 026 — Impuestos: IGV por pagar y Renta RER estimada

## 1. Contexto

El módulo de Finanzas ya produce las dos mitades del impuesto y no las cruza. El
spec 024 dejó `expenses.igv_cents` con la tabla de elegibilidad de crédito
fiscal por tipo de comprobante, y `/admin/finance` pinta la card «IGV de
compras» con `purchaseIgv.creditableCents`. El spec 025 dejó la regla de qué
cuenta como venta declarable —`buildDeclarableFilter()`— y el spec 022 dejó
`electronic_documents.base_cents` e `igv_cents` construidos por adelantado,
calculados con `splitIgv()` al crear cada documento y explícitamente marcados en
el esquema como «desglose exigido por el sub-proyecto #4».

Quien declara ante SUNAT necesita la resta: el IGV que se cobró en las ventas
menos el que se pagó en las compras con derecho a crédito. Y necesita la base
sin IGV de esas mismas ventas, que es sobre lo que el régimen RER calcula el
1.5% de Renta.

Es el **sub-proyecto #4 del roadmap de Finanzas**
(`docs/superpowers/specs/2026-09-21-modulo-finanzas-design.md`), y su diseño
previo es `docs/superpowers/specs/2026-09-21-impuestos-design.md`. Depende de
022, 024 y 025 —los tres `done`— y no modifica ninguno.

## 2. Objetivo

Una persona con `finance.read` abre `/admin/finance/taxes`, elige un rango y ve
cuánto IGV le toca pagar —o cuánto saldo a favor le queda— y cuánta Renta RER
estimada corresponde a los ingresos netos de ese rango.

## 3. Alcance

### Incluye

- Página nueva `/admin/finance/taxes` («Impuestos» en la navegación de admin),
  de solo lectura, con el mismo filtro de rango que el resto del módulo y el mes
  en curso por defecto.
- **Bloque IGV**: débito fiscal (ventas), crédito fiscal (compras) y el neto,
  rotulado «IGV por pagar» o «Saldo a favor» según el signo.
- **Bloque Renta RER**: base de cálculo (ingresos netos del rango, sin IGV) y el
  1.5% resultante, declarado como estimado por rango.
- Endpoint nuevo `GET /api/admin/finance/taxes`.
- Un agregado nuevo en `finance.repository.ts` que **reutiliza**
  `buildDeclarableFilter()` del spec 025 aplicado a `igv_cents` y `base_cents`.
- Módulo puro con la tasa RER y su aritmética entera, con test.

### No incluye (explícito)

- **Cambios de esquema y migraciones.** `electronic_documents.base_cents` e
  `igv_cents` existen desde el spec 022 y `expenses.igv_cents` desde el 024. Los
  índices que sostienen los dos filtros por rango también existen (§5.1). El
  journal de `drizzle/` se queda donde está.
- **Registro de declaraciones presentadas** y cualquier noción de «mes cerrado».
  Decisión de negocio cerrada (§8, D-10).
- **Arrastre automático del saldo a favor entre períodos.** El saldo es
  informativo y se calcula para el rango elegido, nada más.
- **Ajuste anual de Renta.** No aplica a RER. Un cambio de régimen (RMT, General)
  es un sub-proyecto propio, no una extensión de este.
- **Otros tributos**: ITAN, ESSALUD, ONP, retenciones de cuarta categoría,
  detracciones, percepciones y retenciones de IGV. Fuera de alcance total, y su
  ausencia afecta al neto que esta pantalla muestra (§10).
- **Presentación ante SUNAT.** Este módulo calcula, no declara. Sin PDT, sin
  formulario virtual, sin exportación del Registro de Ventas ni de Compras.
- **Cambios en `/admin/finance`.** El resumen, sus cinco cards, `netCents` y
  `marginPercent` se quedan exactamente como están: alinear el resultado del
  período con los impuestos es el sub-proyecto #5 (Ganancias v2).
- **Ningún permiso nuevo.** El catálogo se queda en 29 códigos.
- **Gráficos.** Mismo criterio que 017 (D-13), 021, 024 y 025: sin Recharts en
  esta pantalla.

## 4. Criterios de aceptación

- [ ] AC1 — Dado un visitante sin sesión, cuando pide
      `GET /api/admin/finance/taxes`, entonces recibe `401` con cuerpo
      `{ message }` y no un `307` al formulario de Clerk.
- [ ] AC2 — Dado un usuario con sesión y sin `finance.read`, cuando pide el
      endpoint con una query inválida, entonces recibe `403` y no `400`: la
      autorización ocurre antes de mirar la query.
- [ ] AC3 — Dado un usuario sin `finance.read`, cuando abre
      `/admin/finance/taxes`, entonces `requirePagePermission()` corta el render
      y devuelve el `403` de `src/app/forbidden.tsx`.
- [ ] AC4 — Dada la navegación del panel, entonces «Impuestos» aparece junto a
      «Finanzas» y «Precio unitario», y desaparece con ellas cuando falta
      `finance.read`.
- [ ] AC5 — Dado el rango elegido, entonces el débito fiscal se filtra por
      `electronic_documents.issued_at` —nunca por `created_at` ni `updated_at`— y
      el crédito fiscal por `expenses.incurred_on`, ambos derivados del mismo par
      de días de `resolveFinanceRange()`.
- [ ] AC6 — Dado el cálculo del débito fiscal, entonces usa **la misma función**
      `buildDeclarableFilter()` que las ventas declarables del spec 025, y no una
      segunda copia de esa condición.
- [ ] AC7 — Dada una boleta o factura `issued` con `issued_at` en el rango,
      entonces su `igv_cents` **suma** al débito fiscal y su `base_cents` a la
      base de Renta.
- [ ] AC8 — Dado un comprobante original `voided`, entonces no aporta ni IGV ni
      base, aunque conserve su `issued_at` dentro del rango.
- [ ] AC9 — Dada una nota de crédito **no anulatoria** (motivos 04, 07 o 09),
      entonces su `igv_cents` se **resta** del débito y su `base_cents` de la
      base, y su original sigue aportando.
- [ ] AC10 — Dada una nota de crédito **anulatoria** (motivos 01, 06, 02 o 03,
      que dejan `voided` al original), entonces **no se resta**: la venta sale del
      cálculo por el lado del original y el débito fiscal nunca recibe un aporte
      negativo por esa vía.
- [ ] AC11 — Dada una `comunicacion_baja` emitida, entonces ni suma ni resta.
- [ ] AC12 — Dada una nota de débito `issued` cuyo original sigue `issued`,
      entonces su `igv_cents` **suma** al débito; si el original quedó `voided`,
      no suma.
- [ ] AC13 — Dado el crédito fiscal del rango, entonces es **exactamente** el
      mismo número que la card «IGV de compras» de `/admin/finance` para ese
      mismo rango, porque sale de la misma función de repositorio.
- [ ] AC14 — Dado un gasto con comprobante de un tipo sin derecho a crédito
      (boleta de compra, recibo por honorarios, otro), entonces su IGV **no**
      entra en el crédito fiscal, según `TAX_CREDIT_RECEIPT_TYPES`.
- [ ] AC15 — Dado el neto, entonces es `debitCents − creditCents`, un entero con
      signo, y se publica con su signo: la etiqueta la elige la vista.
- [ ] AC16 — Dado un neto positivo, entonces la vista lo rotula **«IGV por
      pagar»**; dado un neto negativo, lo rotula **«Saldo a favor»** con su valor
      absoluto, con etiqueta, icono y color —nunca un «por pagar» en negativo—; y
      con neto cero, su propia etiqueta.
- [ ] AC17 — Dada la base de Renta, entonces es la suma **sin IGV**
      (`base_cents`) de los mismos documentos que forman el débito, con el mismo
      signo por `kind`.
- [ ] AC18 — Dada la Renta estimada, entonces es `round(base × 1.5%)` calculado
      con aritmética entera de puntos básicos, y vale `0` cuando la base no es
      positiva; la base se publica con su signo real aunque el impuesto sea `0`.
- [ ] AC19 — Dado el bloque de Renta, entonces la vista declara **siempre** que
      es un estimado por rango y que la declaración real de RER es mensual
      exacta, sin depender de qué rango se haya elegido.
- [ ] AC20 — Dado un saldo a favor, entonces la vista dice que es informativo del
      rango y que este panel no lo arrastra al período siguiente ni registra
      declaraciones presentadas.
- [ ] AC21 — Dado un rango sin comprobantes emitidos y sin gastos, entonces la
      respuesta es `200` con ceros y la vista muestra sus copys de estado vacío.
      **No es un error ni un estado de carga**, y nunca un `404`.
- [ ] AC22 — Dado cualquier importe del JSON del endpoint, entonces es un entero
      en céntimos; la división por 100 solo ocurre al formatear en la vista.
- [ ] AC23 — Dada la primera carga, entonces los dos bloques muestran esqueletos;
      ante un fallo de red muestran su mensaje con «Reintentar»; y al cambiar de
      rango se conservan las cifras anteriores en vez de saltar a esqueletos.
- [ ] AC24 — Dado el filtro de rango, entonces es el mismo componente
      `FinanceRangeFilter` con el mes en curso por defecto, y un rango invertido
      no llega a pedirse al servidor.
- [ ] AC25 — Dado el catálogo de permisos, entonces sigue en 29 códigos y toda la
      pantalla está detrás de `finance.read`.
- [ ] AC26 — Dado el directorio `drizzle/`, entonces al terminar este spec el
      journal **sigue en `0012_careful_cargill`**: no se genera ninguna
      migración.
- [ ] AC27 — Dada la arquitectura, entonces ningún componente importa `db`,
      Drizzle ni el repositorio: la página consume hook → service → Route
      Handler.

## 5. Modelo de datos

**Sin cambios de esquema. Sin migración.** Es la primera sección que hay que leer
al aprobar, porque el documento de diseño (§4) pedía añadir dos columnas.

### 5.1 Lo que el diseño pedía añadir y ya existe

| Pieza | Dónde | Estado |
|---|---|---|
| `electronic_documents.base_cents`, `igv_cents` | `src/server/db/schema/electronic-document.ts:71-72` | **Existen.** El comentario dice «desglose exigido por el sub-proyecto #4 (Impuestos)». Los creó el spec 022 (migración `0010_tough_mimic`) |
| `CHECK electronic_documents_amount_breakdown` | mismo archivo, líneas 153-160 | Existe: o los tres son `null`, o `base_cents + igv_cents = amount_cents` con `base_cents > 0` e `igv_cents >= 0`. **El desglose cuadra por constraint, no por confianza** |
| `expenses.igv_cents` | `src/server/db/schema/expense.ts:75` | Existe desde el spec 024, con `CHECK expenses_igv_within_amount` |
| `electronic_documents_issued_at_idx` | `btree (issued_at desc nulls last)` | Existe. Sostiene el rango del débito fiscal. El comentario del esquema ya lo asigna a «#4 (IGV débito fiscal)» |
| `expenses_incurred_on_idx` | `btree (incurred_on desc)` | Existe. Sostiene el rango del crédito fiscal |

**Sin índice nuevo**, y conviene dejar escrito por qué se comprobó: el crédito
fiscal no filtra por `igv_cents`, lo **agrega** sobre las filas que el rango de
`incurred_on` ya selecciona, así que un índice sobre esa columna no participaría
en el plan. El join al padre del débito recorre `p.id`, que es la clave primaria
(025, §5.1). Ver D-11.

### 5.1.1 Punto normativo que hay que confirmar al aprobar

> **La tasa de 1.5% de Renta RER no se pudo contrastar contra normativa vigente
> en esta sesión**, igual que le pasó al spec 024 con la tabla de crédito fiscal
> (024, §5.1.1). Se señala aquí, arriba y no enterrado en las decisiones, con el
> mismo mecanismo: es un valor que alguien con acceso a la fuente tiene que
> confirmar antes de que la pantalla lo muestre a una persona que va a declarar.

La tasa vive en **una sola constante** de un módulo puro con su test, así que
corregirla es editar un número y su prueba: ninguna otra pieza depende del valor
concreto, solo de que la constante exista (§6.4, D-8).

Se hereda además la advertencia de 024: la tabla `PURCHASE_RECEIPT_RULES`
tampoco pudo verificarse contra normativa, y `expenses.igv_cents` se calcula **al
guardar**, así que corregir una celda no recalcula las filas ya registradas. El
crédito fiscal de esta pantalla arrastra esa misma limitación.

### 5.2 IGV débito fiscal (ventas) — reutiliza la regla del spec 025

> **Esto se aparta de la fórmula del documento de brainstorming (§5) y hay que
> confirmarlo al aprobar.**

El diseño de este sub-proyecto propone:

```
igvDebito =
    sum(igv_cents WHERE kind IN ('boleta','factura') AND status = 'issued')
  − sum(igv_cents WHERE kind = 'nota_credito'        AND status = 'issued')
  + sum(igv_cents WHERE kind = 'nota_debito'          AND status = 'issued')
```

Es la **misma fórmula que el spec 025 ya descartó** para las ventas declarables,
aplicada al IGV. Verificado en `src/modules/invoicing/lib/adjustment.ts:82-90` y
en `src/server/services/electronic-document.service.ts:386-413`: la
`comunicacion_baja` no es el único documento que anula a su padre —una nota de
crédito con motivo 01, 06, 02 o 03 deja `voided` al original en la misma
transacción en que se emite—, así que esa fórmula da un **IGV débito negativo**
en una anulación total fuera de ventana y **cero** en una corrección de
comprador. Sobre un impuesto, declarar de menos no es un matiz de presentación.

La regla correcta ya está construida, probada y en producción desde el spec 025,
en `src/server/repositories/finance.repository.ts:108-117`:

```ts
export function buildDeclarableFilter({ from, to }: InstantRange, parent: ParentAlias): SQL {
  return and(
    eq(electronicDocuments.status, 'issued'),
    gte(electronicDocuments.issuedAt, from),
    lt(electronicDocuments.issuedAt, to),
    or(isNull(electronicDocuments.relatedDocumentId), eq(parent.status, 'issued')),
  ) as SQL;
}
```

> Un documento cuenta cuando (a) está `issued`, (b) su `issued_at` cae en el
> rango y (c) la venta que documenta sigue contando: es un original, o su padre
> sigue `issued`. El signo lo da el `kind`: original `+`, `nota_credito` `−`,
> `nota_debito` `+`.

**Este spec importa esa función, no la reescribe** (AC6, D-2). Lo único que
cambia respecto a 025 es la columna que se suma: `igv_cents` y `base_cents` en
vez de `amount_cents`, y sin `GROUP BY` por familia —el IGV se declara junto, no
por tipo de comprobante—:

```sql
select
  coalesce(sum(case when d.kind = 'nota_credito'
                    then -d.igv_cents  else d.igv_cents  end), 0)::bigint as igv_cents,
  coalesce(sum(case when d.kind = 'nota_credito'
                    then -d.base_cents else d.base_cents end), 0)::bigint as base_cents,
  count(*) filter (where d.related_document_id is null)::int     as document_count,
  count(*) filter (where d.related_document_id is not null)::int as adjustment_count
from electronic_documents d
left join electronic_documents p on p.id = d.related_document_id
where <buildDeclarableFilter(range, p)>
```

- La `comunicacion_baja` sale sola: su padre siempre queda `voided`. Y aunque se
  colara, `base_cents` e `igv_cents` son `null` por `CHECK` y `sum` ignora los
  nulos (AC11).
- Sin `GROUP BY`, así que esta consulta **no entra** en la clase de bug del
  `42803` del spec 015 y no necesita agrupar por ordinal.
- `::bigint` con `Number()` de vuelta, como el resto del módulo (017, D-11): la
  suma lleva signo, así que un `int4` desborda por los dos extremos.
- **Este lado no es una estimación.** `base_cents` e `igv_cents` los escribió
  `splitIgv()` al crear el documento y son exactamente el desglose que se envió
  al proveedor, con `base + igv = total` garantizado por `CHECK`. La asunción
  declarada es que **todo el catálogo tributa al 18% general** (022, §6.4): sin
  productos exonerados ni inafectos (§10).

### 5.3 IGV crédito fiscal (compras) — sin función nueva

Ya existe y ya aplica la tabla de elegibilidad del spec 024. Verificado en
`finance.repository.ts:243` y `253-282`:

```ts
const CREDITABLE = inArray(expenses.receiptType, TAX_CREDIT_RECEIPT_TYPES);
// …
igvCreditableCents: sql`coalesce(sum(${expenses.igvCents}) filter (where ${CREDITABLE}), 0)::bigint`,
igvCreditableCount: sql`count(*) filter (where ${expenses.igvCents} is not null and ${CREDITABLE})::int`,
```

`TAX_CREDIT_RECEIPT_TYPES` se deriva de `PURCHASE_RECEIPT_RULES`
(`src/lib/purchase-receipts.ts:36-60`), cuyos valores vigentes son:

| Tipo | `carriesIgv` | `grantsTaxCredit` |
|---|---|---|
| `factura` | sí | **sí** |
| `boleta` | sí | no |
| `recibo_honorarios` | no | no |
| `otro` | no | no |

Es decir, hoy `TAX_CREDIT_RECEIPT_TYPES === ['factura']`. Este spec **no toca esa
tabla ni la relaja**: la lee a través de la función que ya la usa (D-4, AC13,
AC14).

`findExpenseTotals(range: DayRange)` se llama tal cual y se leen dos de sus seis
campos: `igvCreditableCents` y `igvCreditableCount`.

### 5.4 Reglas de cálculo del período

**Rango.** El mismo `resolveFinanceRange()` de siempre: días inclusivos
`[fromDay, toDay]` en `America/Lima` y su ventana semiabierta de instantes
`[from, to)`. El débito usa los instantes; el crédito, los días (AC5).

**Neto de IGV:**

```
netCents = debitCents − creditCents
```

Se publica **con signo** (D-5). `netCents > 0` → «IGV por pagar». `netCents < 0`
→ «Saldo a favor» por `|netCents|`. `netCents === 0` → su propia etiqueta. La
vista comunica el signo con etiqueta, icono y color, nunca solo con color (017,
AC9; AC16).

**Renta RER (estimado):**

```
estimatedCents = baseCents > 0 ? round(baseCents × 150 / 10_000) : 0
```

`150` puntos básicos = 1.5%. **Aritmética entera**, no `× 0.015` (D-7). La base
es la de §5.2: ingresos netos sin IGV, con el signo de las correcciones
aplicado. Si la base no es positiva, el estimado es `0` y no un impuesto
negativo (D-6, AC18) —la base sí se publica con su signo real, así que el dato
crudo no se pierde—.

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| GET | `/api/admin/finance/taxes` | `finance.read` | query: `from?`, `to?` | `FinanceTaxesResponse` | 400, 401, 403, 500 |

Entrada: el `financeRangeSchema` que ya existe, sin parámetro nuevo. Un rango
vacío es `200` con ceros, nunca `404` (AC21).

### 6.1 Tipos de salida — `src/modules/finance/types/finance.types.ts`

```ts
// Los dos lados del IGV del período y su resta. Nunca se publican sumados ni
// pre-etiquetados: el signo es el dato y la etiqueta es de la vista (D-5).
export type IgvSettlement = {
  /** IGV de las ventas declarables del rango: originales + notas de débito − notas de crédito. */
  debitCents: number;
  /** Comprobantes originales contados en el débito. */
  debitDocumentCount: number;
  /** Notas de crédito y débito contadas. Explica por qué el débito no es el bruto. */
  debitAdjustmentCount: number;
  /**
   * IGV de compras **con derecho a crédito fiscal**. Sale de `findExpenseTotals()`, la
   * misma función que alimenta la card «IGV de compras» del resumen, así que las dos
   * pantallas no pueden discrepar (AC13).
   */
  creditCents: number;
  creditReceiptCount: number;
  /** `debitCents − creditCents`, con signo. Positivo = por pagar; negativo = saldo a favor. */
  netCents: number;
};

// Estimado del rango, no la declaración. La **tasa no viaja en la respuesta**: es
// derivable de un módulo puro que el cliente puede importar, y publicarla sería una
// segunda fuente de la misma regla (D-8, mismo criterio que `grantsTaxCredit()` en 024).
export type IncomeTaxEstimate = {
  /** Ingresos netos del rango, **sin IGV**. Se publica con su signo real. */
  baseCents: number;
  /** `round(base × 1.5 %)` en aritmética entera; `0` cuando la base no es positiva (D-6). */
  estimatedCents: number;
};

export type FinanceTaxes = {
  igv: IgvSettlement;
  incomeTax: IncomeTaxEstimate;
};

export type FinanceTaxesResponse = {
  data: FinanceTaxes;
  meta: {
    // El rango realmente consultado, resuelto en el servidor: la UI rotula con esto y
    // un error de huso queda visible en la respuesta. Misma forma que el resumen.
    range: { from: string; to: string };
    timeZone: string;
    generatedAt: string;
  };
};
```

### 6.2 Firma del repositorio — `src/server/repositories/finance.repository.ts`

```ts
export type DeclarableTaxTotals = {
  /** Débito fiscal del rango, en céntimos y con signo. */
  igvCents: number;
  /** Base sin IGV de los mismos documentos, con el mismo signo. */
  baseCents: number;
  documentCount: number;
  adjustmentCount: number;
};

/**
 * Los cuatro números del lado de ventas, de **una sola pasada** y con el mismo
 * `buildDeclarableFilter()` que las ventas declarables (§5.2). Sin `GROUP BY`: el IGV se
 * declara junto y no por familia de comprobante.
 */
export async function findDeclarableTaxTotals(
  range: InstantRange,
  reader?: Reader,
): Promise<DeclarableTaxTotals>;
```

Reutiliza el alias de módulo `parentDocuments` que ya existe en el archivo: el
`WHERE` y el `JOIN` tienen que hablar de la misma tabla, y esa es exactamente la
razón por la que aquel alias se declaró a nivel de módulo.

**Sin función nueva para el crédito fiscal**: se llama a `findExpenseTotals()`
(D-4).

### 6.3 Forma del handler — `src/app/api/admin/finance/taxes/route.ts`

```ts
await authorize('finance.read');            // antes de mirar la query (AC2)
// … financeRangeSchema.safeParse → 400 …
const now = new Date();
const range = resolveFinanceRange(parsed.data, now);

// Dos lecturas independientes: el coste es el de la más lenta (015, D-5).
const [declarable, expenseTotals] = await Promise.all([
  financeRepository.findDeclarableTaxTotals(range),
  financeRepository.findExpenseTotals(range),
]);

// Resta entera, con signo. La etiqueta la elige la vista (D-5, AC15).
const igv: IgvSettlement = {
  debitCents: declarable.igvCents,
  debitDocumentCount: declarable.documentCount,
  debitAdjustmentCount: declarable.adjustmentCount,
  creditCents: expenseTotals.igvCreditableCents,
  creditReceiptCount: expenseTotals.igvCreditableCount,
  netCents: declarable.igvCents - expenseTotals.igvCreditableCents,
};

const incomeTax: IncomeTaxEstimate = {
  baseCents: declarable.baseCents,
  estimatedCents: estimateRerIncomeTax(declarable.baseCents),
};
```

`meta` se construye igual que en `/summary`, con el **mismo `now`** para el rango
y para `generatedAt`.

### 6.4 Módulo puro de Renta — `src/modules/finance/lib/rer.ts`

```ts
/**
 * Régimen Especial de Renta: 1.5 % de los ingresos netos del mes, sin ajuste anual.
 * **Valor normativo pendiente de confirmar** (§5.1.1): esta constante y su test son el
 * único sitio donde vive, así que corregirla es editar un número y una prueba.
 */
export const RER_RATE_BASIS_POINTS = 150;

/**
 * Puntos básicos y no `× 0.015`: el módulo es entero en céntimos de punta a punta
 * (017, D-11; 022, `splitIgv`) y `0.015` no es representable en binario (D-7).
 *
 * Base no positiva → `0`. Un rango cuyas notas de crédito superan lo emitido no genera
 * un crédito de Renta que este panel pueda afirmar (D-6).
 */
export function estimateRerIncomeTax(baseCents: number): number {
  if (baseCents <= 0) return 0;
  return Math.round((baseCents * RER_RATE_BASIS_POINTS) / 10_000);
}
```

## 7. Arquitectura y archivos afectados

- `src/modules/finance/types/finance.types.ts` — `IgvSettlement`,
  `IncomeTaxEstimate`, `FinanceTaxes`, `FinanceTaxesResponse`.
- `src/modules/finance/lib/rer.ts` + `.test.ts` — **nuevos**: la tasa y su
  aritmética entera.
- `src/server/repositories/finance.repository.ts` + `.test.ts` —
  `findDeclarableTaxTotals()` y los tests de su SQL compilado.
- `src/app/api/admin/finance/taxes/route.ts` — **nuevo**: Route Handler.
- `src/modules/finance/services/finance.service.ts` — `fetchFinanceTaxes()`.
- `src/modules/finance/constants.ts` — `financeKeys.taxes` y los copys del
  bloque de IGV, del de Renta y de sus estados vacíos.
- `src/modules/finance/hooks/use-finance-taxes.ts` — **nuevo**.
- `src/modules/finance/components/finance-taxes-cards.tsx` — **nuevo**:
  presentacional puro, recibe todo por props.
- `src/modules/finance/components/finance-taxes-overview.tsx` — **nuevo**:
  contenedor `"use client"` con el estado del rango y el filtro.
- `src/app/(admin)/admin/finance/taxes/page.tsx` — **nuevo**: Server Component
  con `requirePagePermission('finance.read')`.
- `src/app/(admin)/admin/layout.tsx` — entrada «Impuestos» en `NAV_ITEMS`.
- `docs/SETUP.md` — §6, módulo financiero.

**Sin cambios**, y conviene escribirlo para que no se toquen: el esquema y
`drizzle/`, `src/lib/permissions.ts`, `src/lib/purchase-receipts.ts`,
`buildDeclarableFilter()` y `findExpenseTotals()` —se **usan**, no se editan—,
`/api/admin/finance/summary`, `finance-summary-cards.tsx`,
`finance-overview.tsx`, `finance-range-filter.tsx` y toda la tabla de gastos.

Flujo, capa por capa, sin saltos:

```
FinanceTaxesOverview ("use client")
  → useFinanceTaxes (TanStack Query)
    → finance.service (axios)
      → /api/admin/finance/taxes   (authorize → Zod → resta entera)
        → finance.repository (Drizzle) → Neon
```

`finance-taxes-cards.tsx` no consulta nada: recibe `FinanceTaxes` por props
(AC27). El único módulo de servidor que el cliente importa es `rer.ts`, que es
puro —sin Drizzle, sin React, sin Zod—, igual que `purchase-receipts.ts`.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: Ruta y endpoint propios, `/admin/finance/taxes` y `GET /api/admin/finance/taxes` | Añadir `data.taxes` a `GET /api/admin/finance/summary` y pintarlo en el resumen | Esta pantalla no consume **ninguno** de los ocho campos del resumen, y el resumen no consume ninguno de los de impuestos. Compartir endpoint haría que cada pantalla pagara las lecturas de la otra —cinco consultas para mostrar dos números— y publicaría en el contrato del resumen campos que `/admin/finance` no pinta, que es justo lo que 025 evitó con `base_cents` (D-13). El precedente es `/admin/finance/pricing`, la segunda pantalla del módulo, con su propia ruta y su propio endpoint (021, D-13) |
| **D-2**: El débito fiscal **importa** `buildDeclarableFilter()`; no se escribe una segunda condición | La fórmula del documento de brainstorming (§5): restar toda nota de crédito `issued` | Verificado en `adjustment.ts:82-90` y `electronic-document.service.ts:386-413`: una nota de crédito con motivo 01, 06, 02 o 03 deja `voided` al original en la misma transacción. Con la fórmula del diseño, una anulación total fuera de ventana declara **IGV débito negativo** y una corrección de comprador declara cero (§5.2). El spec 025 ya resolvió esto y su regla está probada; **reutilizar la función y no copiar su condición** es lo que hace estructuralmente imposible que ventas declarables e IGV débito discrepen sobre qué documento cuenta |
| **D-3**: Agregado propio `findDeclarableTaxTotals()` en vez de ampliar `findDeclarableSalesByKind()` | Añadirle `igvCents` y `baseCents` a la función de 025 y derivar de ahí los dos números | Aquella función devuelve el tipo **publicado** `DeclarableSalesByKind[]`, así que ampliarla publicaría base e IGV en `/summary`, que 025 dejó fuera a propósito (D-13). Además impuestos no necesita el `GROUP BY` por familia —el IGV se declara junto— y sin él la consulta ni siquiera roza la precaución del `42803`. Las dos funciones comparten la única pieza donde equivocarse cuesta dinero: el filtro |
| **D-4**: El crédito fiscal reutiliza `findExpenseTotals()` tal cual, leyendo dos de sus seis campos | Una consulta nueva que sume solo `igv_cents` de los tipos elegibles | Esa consulta ya existe y ya aplica `TAX_CREDIT_RECEIPT_TYPES` derivado de `PURCHASE_RECEIPT_RULES`. Una segunda con la misma regla es la copia que se desalinea el día que la tabla cambie, y reutilizarla garantiza por construcción que el crédito de esta pantalla sea **el mismo número** que la card «IGV de compras» del resumen (AC13). Los cuatro campos que sobran salen de la misma fila del mismo `SELECT`: no cuestan una consulta más |
| **D-5**: `netCents` se publica con signo; la etiqueta la elige la vista | Publicar `payableCents` y `creditBalanceCents` ya separados, uno de ellos siempre `0` | Dos campos de los que siempre uno vale cero invitan a sumarlos o a pintar los dos, y obligan al servidor a decidir una etiqueta que es un asunto de presentación. Con un entero con signo, la resta del contrato es la resta contable, y la vista elige etiqueta, icono y color —los tres, no solo color (017, AC9)—. Mismo criterio que `netCents` del resumen, que también puede ser negativo |
| **D-6**: Renta estimada `0` cuando la base no es positiva; la base se publica con su signo | Publicar un impuesto negativo proporcional a la base negativa | Un rango cuyas notas de crédito superan lo emitido no genera «Renta a favor»: eso sería una afirmación tributaria que este spec no hace y que el contador no podría usar. Devolver `0` es honesto y no destruye información, porque `baseCents` viaja con su signo real al lado |
| **D-7**: Aritmética entera de puntos básicos, `round(base × 150 / 10_000)` | `Math.round(baseCents * 0.015)` | El módulo es entero en céntimos de punta a punta (017, D-11) y `0.015` no es representable en binario: la multiplicación introduce el mismo tipo de desviación de un céntimo que `splitIgv()` evita calculando el IGV como residuo (022). Con puntos básicos enteros, la única aproximación es el `round` final, que es la que la norma exige de todos modos |
| **D-8**: La tasa **no viaja** en la respuesta; la vista importa `RER_RATE_BASIS_POINTS` del módulo puro | Publicar `rateBasisPoints` en `IncomeTaxEstimate` para que la vista rotule «1,5 %» | Precedente exacto del spec 024 con `grantsTaxCredit()`: publicar una regla que el cliente puede derivar de un módulo puro crea una segunda fuente de la misma verdad, y el día que la tasa cambie habría que acordarse de las dos. `rer.ts` no importa Drizzle ni React, así que el componente lo importa sin arrastrar nada de servidor. El copy **no escribe «1,5 %» a mano**: lo formatea desde la constante |
| **D-9**: Página nueva y no una pestaña o una sexta card en `/admin/finance` | Añadir dos cards más al resumen | El resumen ya pinta cinco cards, un desglose de hasta ocho categorías y una tabla paginada; dos cards más lo convierten en una pantalla que no se lee de un vistazo. Y se miran en momentos distintos: el resumen, al revisar cómo va el mes; los impuestos, al declarar. A diferencia de `/admin/finance/pricing` —que no tiene fechas y por eso es ruta propia (021, D-13)—, aquí el rango sí significa lo mismo en las dos pantallas, así que se reutiliza **el mismo `FinanceRangeFilter`** en vez de escribir otro |
| **D-10**: Sin tabla de declaraciones y sin arrastre de saldo a favor | Registrar períodos declarados y arrastrar automáticamente el saldo al siguiente | Decisión de negocio cerrada en el brainstorming (§2) y coherente con el módulo: 017 (D-8, D-13) estableció rango libre y sin cierre de período. Un arrastre automático sobre un panel que no sabe qué se declaró realmente inventaría un saldo que nadie confirmó, y sería peor que no tenerlo. El copy lo dice en la pantalla (AC20) |
| **D-11**: Sin índice nuevo | Un índice sobre `expenses.igv_cents`, o uno parcial por `receipt_type` elegible | Comprobado contra el plan que la consulta necesita: el crédito fiscal **no filtra** por `igv_cents`, lo agrega sobre las filas que `expenses_incurred_on_idx` ya selecciona por rango, así que un índice sobre esa columna no participaría. El débito se apoya en `electronic_documents_issued_at_idx` y el join al padre en la clave primaria (025, §5.1). Sería optimizar sin medida, y sobre un registro manual de gastos cuyo volumen ya se juzgó insuficiente para justificar un índice por categoría (024) |
| **D-12**: Dos bloques con barras CSS, sin Recharts | Un gráfico de barras débito/crédito, o cuatro cards sueltas | Son cuatro números en total. El módulo ya tiene su forma para esto —las barras en CSS de `ExpensesByCategory` y de `DeclarableSalesFooter`—, y traer una librería de gráficos para dos barras sería más cromo que información. Coherente con 017 (D-13), que dejó los gráficos fuera del módulo entero |
| **D-13**: El aviso de «estimado» del bloque de Renta se muestra **siempre**, sin comprobar si el rango es un mes calendario completo | Detectar si `[from, to]` cubre un mes exacto y solo entonces omitir el aviso | El diseño lo sugería condicional, pero un aviso que aparece y desaparece enseña a ignorarlo, y la declaración real tampoco coincide con un mes elegido a mano aunque las fechas cuadren: se presenta con el cronograma de SUNAT y sobre los libros del contribuyente. La condición añadiría una función con su test para hacer **menos** visible una advertencia normativa. Mismo criterio aplicado al IGV, que también se declara por mes calendario (§10) |

## 9. Tareas

Orden de dependencia: tipos → módulo puro → tests → repositorio → tests →
handler → service → copys → hook → componentes → página → navegación →
documentación → cierre.

- [ ] **T1** — Tipos `IgvSettlement`, `IncomeTaxEstimate`, `FinanceTaxes` y
      `FinanceTaxesResponse` con los comentarios de §6.1 · archivo:
      `src/modules/finance/types/finance.types.ts` · verificación:
      `npm run typecheck`
- [ ] **T2** — Módulo puro de Renta: `RER_RATE_BASIS_POINTS` y
      `estimateRerIncomeTax()` según §6.4, con el comentario que señala el valor
      normativo pendiente (§5.1.1) · archivo:
      `src/modules/finance/lib/rer.ts` · verificación: `npm run typecheck`
- [ ] **T3** — Tests de T2, al estilo de `igv.test.ts`: el 1.5% de un importe
      redondo; el redondeo de un importe que cae a medio céntimo; base `0` →
      `0`; base negativa → `0` (AC18); y que el resultado es siempre un entero ·
      archivo: `src/modules/finance/lib/rer.test.ts` · verificación: `npm test`
- [ ] **T4** — `findDeclarableTaxTotals()` según §5.2 y §6.2: `leftJoin` al alias
      `parentDocuments` ya existente, `where(buildDeclarableFilter(range,
      parentDocuments))` **importado y no reescrito**, los dos `CASE` de signo
      sobre `igv_cents` y `base_cents`, los dos `FILTER` de conteo y el
      `::bigint` con `toCents()` · archivo:
      `src/server/repositories/finance.repository.ts` · verificación:
      `npm run typecheck`
- [ ] **T5** — Tests del SQL compilado de T4 con `PgDialect`, siguiendo el patrón
      de `finance.repository.test.ts`: contiene `status = 'issued'`, acota los
      dos extremos de `issued_at` con el superior **estricto**, contiene la
      disyunción «sin padre o padre `issued`», suma `igv_cents` y `base_cents` en
      negativo solo para `nota_credito`, y **no** contiene `group by` · archivo:
      `src/server/repositories/finance.repository.test.ts` · verificación:
      `npm test`
- [ ] **T6** — Route Handler `GET /api/admin/finance/taxes` según §6.3:
      `authorize('finance.read')` antes de la query, `financeRangeSchema`, las
      dos lecturas en `Promise.all`, la resta entera del neto y `meta` con el
      mismo `now` · archivo: `src/app/api/admin/finance/taxes/route.ts` ·
      verificación: `npm run typecheck && npm run lint`
- [ ] **T7** — `fetchFinanceTaxes(range)` en el service, con la misma forma que
      `fetchFinanceSummary` · archivo:
      `src/modules/finance/services/finance.service.ts` · verificación:
      `npm run typecheck`
- [ ] **T8** — Copys y clave de consulta: `financeKeys.taxes(range)`, títulos de
      los dos bloques, etiquetas de débito y crédito, las tres etiquetas del neto
      («IGV por pagar», «Saldo a favor», neto cero), la nota de que el saldo a
      favor es informativo y no se arrastra (AC20), la nota de que la Renta es un
      estimado por rango (AC19), los dos estados vacíos y el mensaje de error.
      **El porcentaje de la tasa no se escribe a mano** (D-8) · archivo:
      `src/modules/finance/constants.ts` · verificación: `npm run typecheck`
- [ ] **T9** — Hook `useFinanceTaxes(range)` con `placeholderData:
      keepPreviousData` y sin `refetchInterval`, igual que `useFinanceSummary` ·
      archivo: `src/modules/finance/hooks/use-finance-taxes.ts` · verificación:
      `npm run typecheck`
- [ ] **T10** — Componente presentacional de los dos bloques: recibe
      `FinanceTaxes | undefined`, `isLoading`, `isError`, `message` y `onRetry`;
      esqueletos en la primera carga y mensaje con «Reintentar» en el error
      (AC23); el neto con etiqueta, icono y color según el signo y **nunca un
      "por pagar" negativo** (AC16); las barras de débito y crédito en CSS sobre
      el mayor de los dos en valor absoluto, al estilo de
      `DeclarableSalesFooter`; y el porcentaje de la tasa formateado desde
      `RER_RATE_BASIS_POINTS` · archivo:
      `src/modules/finance/components/finance-taxes-cards.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [ ] **T11** — Contenedor `"use client"`: estado del rango con
      `currentMonthRange(new Date())` memoizado en el montaje, el
      `FinanceRangeFilter` existente y el hook de T9, con `query.isPending` como
      `isLoading` · archivo:
      `src/modules/finance/components/finance-taxes-overview.tsx` ·
      verificación: `npm run typecheck && npm run lint`
- [ ] **T12** — Página Server Component con `requirePagePermission('finance.read')`,
      `metadata`, encabezado que dice que el panel **calcula y no declara**, y
      las dos notas informativas (saldo a favor y estimado de Renta) · archivo:
      `src/app/(admin)/admin/finance/taxes/page.tsx` · verificación:
      `npm run typecheck && npm run lint`
- [ ] **T13** — Entrada «Impuestos» en `NAV_ITEMS` con `permission:
      'finance.read'`, detrás de «Precio unitario» y con un icono propio
      (`Landmark`), que no repita ninguno de los ya usados · archivo:
      `src/app/(admin)/admin/layout.tsx` · verificación: `npm run typecheck`
- [ ] **T14** — Documentar en `docs/SETUP.md` §6: la pantalla nueva, el endpoint
      nuevo, que el débito reutiliza `buildDeclarableFilter()` y el crédito
      `findExpenseTotals()`, que no hay migración ni permiso nuevo, y las dos
      advertencias normativas pendientes (tasa RER y tabla de crédito fiscal).
      **Sin tocar §5.3**: no hay cambio de esquema que registrar · archivo:
      `docs/SETUP.md` · verificación: lectura
- [ ] **T15** — Cierre: confirmar que `drizzle/` sigue en `0012_careful_cargill`
      y que `src/lib/permissions.ts` sigue en 29 códigos (AC25, AC26) ·
      verificación: `npm run typecheck && npm run lint && npm test && npm run build`

## 10. Riesgos y consideraciones

- **Los dos lados del IGV no tienen la misma calidad de dato, y la pantalla los
  presenta juntos.** El débito es exacto: `base_cents` e `igv_cents` son el
  desglose que se envió al proveedor, con `base + igv = total` garantizado por
  `CHECK`. El crédito es una **aproximación**: `expenses.igv_cents` asume 18%
  incluido sobre un importe que alguien teclea (024). Restar un número exacto
  menos uno aproximado da un neto aproximado, y el copy no debe sugerir que esta
  cifra es la que se presenta ante SUNAT.
- **Dos valores normativos sin verificar.** La tasa de 1.5% de RER (§5.1.1) y la
  tabla de elegibilidad de crédito fiscal (024, §5.1.1). Ninguna sesión hasta
  ahora ha tenido acceso a fuente normativa. Subdeclarar crédito se corrige;
  sobredeclararlo es una infracción, y por eso la tabla se conserva conservadora
  y este spec **no la relaja**.
- **Productos exonerados o inafectos.** Todo el cálculo del débito asume que el
  catálogo entero tributa al 18% general (022, §6.4). El día que se venda algo
  exonerado, el IGV débito lo sobreestimaría; es una revisión de `splitIgv()` y
  del momento de emisión, no de esta pantalla.
- **Un rango que no es un mes calendario no es un período declarable.** SUNAT
  declara IGV y Renta por mes exacto. Esta pantalla acepta cualquier rango porque
  el módulo entero funciona así (017, D-8), pero una persona puede mirar «del 15
  al 15» y creer que eso se declara. Los copys de los dos bloques tienen que
  decirlo, y por eso el aviso es permanente y no condicional (D-13).
- **El IGV débito de un período pasado puede bajar al recargar.** Herencia
  directa de 025 (§10): una nota de crédito anulatoria emitida en octubre deja
  `voided` un original de septiembre, así que septiembre pierde ese IGV aunque
  «ya estuviera declarado». Contablemente lo discutible es que la nota se
  registra en **su** período, restando allí. Este spec no lo agrava —no cierra
  períodos ni guarda lo declarado— pero es aquí donde la diferencia empieza a
  importar de verdad (§11).
- **El neto ignora retenciones, percepciones y detracciones.** Un negocio sujeto
  a alguno de esos regímenes pagaría menos de lo que esta pantalla dice. Está
  fuera de alcance explícito (§3), y el copy no debe presentar el neto como «lo
  que hay que pagar», sino como el resultado de débito menos crédito.
- **El saldo a favor no se arrastra.** Si un mes queda en saldo a favor y el
  siguiente en IGV por pagar, la pantalla mostrará el segundo íntegro sin
  descontar el primero. Es la decisión de §2 del diseño y el copy lo dice
  (AC20), pero es el malentendido más probable de toda la pantalla.
- **Rendimiento.** Dos consultas, las dos acotadas por índices que ya existen
  (`electronic_documents_issued_at_idx` y `expenses_incurred_on_idx`), sin N+1 y
  en `Promise.all`, así que el coste es el de la más lenta. La consulta del
  débito es la de 025 sin su `GROUP BY`.
- **Desbordamiento.** Las dos sumas llevan signo y se castean a `::bigint` con
  `Number()` de vuelta (017, D-11): un `int4` desbordaría por los dos extremos.
- **La correspondencia entre el débito fiscal y las ventas declarables no la
  sostiene el typecheck**, sino el hecho de compartir `buildDeclarableFilter()`
  más los tests de T5. Si alguien copiara la condición en vez de importarla, las
  dos pantallas podrían divergir en silencio; el comentario de la función y los
  tests son la única barrera.

## 11. Fuera de alcance / deuda aceptada

- **Registro de declaraciones presentadas y arrastre del saldo a favor.** Se
  retoma si alguien pide que el panel diga cuánto se pagó realmente cada mes,
  que es el requisito que hoy no existe y que haría falta para arrastrar un
  saldo sin inventarlo (D-10).
- **El período contable de la nota de crédito.** Hoy una nota anulatoria saca la
  venta —y ahora también su IGV— del período del original en vez de restar en el
  suyo. El spec 025 dejó esta deuda enganchada precisamente a «cuando el #4 tenga
  que producir un Registro de Ventas por período cerrado»: este spec **no** lo
  produce, así que la deuda sigue viva y se traslada al primer spec que cierre
  períodos.
- **Confirmación normativa de la tasa RER y de la tabla de crédito fiscal.** Las
  dos esperan a una sesión con acceso a fuente. Corregir cualquiera de las dos es
  editar una constante y su test, y en el caso de la tabla de compras hay que
  recordar que `expenses.igv_cents` no se recalcula hacia atrás (024, §10).
- **Cambio de régimen tributario.** El diseño asume RER de forma fija, como
  constante y no como configuración del panel. Si el negocio pasa a RMT o al
  Régimen General —con pagos a cuenta y regularización anual—, es una revisión
  explícita de este sub-proyecto, no una abstracción que haya que anticipar hoy.
- **Otros tributos y regímenes de retención.** ITAN, ESSALUD, ONP, retenciones de
  cuarta categoría, detracciones, percepciones y retenciones de IGV.
- **Exportación del Registro de Ventas y del Registro de Compras**, y cualquier
  forma de presentación ante SUNAT.
- **Alinear el resultado del período con los impuestos.** Es el sub-proyecto #5
  (Ganancias v2), que resta impuestos a la utilidad. Aquí `netCents` del resumen
  sigue siendo ventas confirmadas menos gastos (025, D-10).
