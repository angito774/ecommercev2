---
id: 022
title: Facturación electrónica — emisión manual de boleta y factura (Nubefact)
status: done
module: invoicing
scope: both
created: 2026-09-22
---

# 022 — Facturación electrónica: emisión de boleta y factura desde el panel

> Sub-proyecto **#0** del roadmap del módulo de Finanzas
> ([2026-09-21-modulo-finanzas-design.md](../superpowers/specs/2026-09-21-modulo-finanzas-design.md)).
> Documento de diseño previo:
> [2026-09-21-facturacion-electronica-design.md](../superpowers/specs/2026-09-21-facturacion-electronica-design.md).
> Ajustes anticipados por #3 y #4 que este spec absorbe: `issued_at`
> ([ingresos-v2](../superpowers/specs/2026-09-21-ingresos-v2-design.md) §4) y
> `base_cents` / `igv_cents`
> ([impuestos](../superpowers/specs/2026-09-21-impuestos-design.md) §4).

## 0. Por qué el sub-proyecto se parte en dos specs

El documento de diseño de #0 cubre cuatro cosas: emisión del comprobante
original, notas de crédito, notas de débito y comunicación de baja, más el
reembolso en Stripe. Al verificarlo contra el código quedó claro que son **dos
unidades de trabajo con dependencias distintas**, y se parten:

| Spec | Contenido | Depende de |
|---|---|---|
| **022** (este) | Datos fiscales en el checkout · tabla `electronic_documents` completa · correlativos · proveedor Nubefact detrás de `InvoicingProvider` · **emisión disparada a mano desde `/admin/orders`** · comprobante visible en «Mis compras» y en el panel | Nada nuevo |
| **023** | «Ajustar pedido»: reembolso en Stripe (total o parcial) + nota de crédito / nota de débito / comunicación de baja, permiso `orders.refund` | **022 entero** |

La razón de la partición es de dependencia real, no de tamaño: una nota de
crédito **referencia un comprobante ya emitido** (`related_document_id` apunta a
una fila `issued`), así que 023 no se puede probar de punta a punta hasta que 022
emita de verdad contra Nubefact. Mantenerlos juntos significaría un bucle
developer ⇄ reviewer sobre ~55 tareas en el que un hallazgo en el reembolso
bloquearía la emisión, que es la parte que el negocio necesita primero y que,
sola, ya es legalmente obligatoria.

**Todo el esquema se crea en este spec, incluido lo que solo usa 023**
(`orders.refunded_amount_cents`, `related_document_id`, `reason_code`,
`stripe_refund_id`, las series de nota de crédito y débito, y los valores
`nota_credito`/`nota_debito`/`comunicacion_baja` del enum). Consecuencia buscada:
**023 no lleva migración** y este repo no acumula una migración por cada
sub-proyecto de finanzas sobre la misma tabla. El mismo criterio aplica a
`issued_at`, `base_cents` e `igv_cents`, que pertenecen a #3 y #4 pero se crean
aquí porque se rellenan en el instante de la emisión y añadirlas después
obligaría a un backfill imposible: no se puede reconstruir la fecha de emisión ni
el desglose de IGV de un documento ya enviado a SUNAT.

## 1. Contexto

Lo que hoy recibe un cliente al comprar **no es un comprobante de pago**. Está
verificado en el código:

- `src/server/services/order-receipt.service.ts:24-54` resuelve
  `Charge.receipt_url` de Stripe y ese enlace, además de caducar a los 30 días
  (D-3 del spec 008), es un recibo del procesador, no una boleta electrónica de
  SUNAT.
- `src/server/db/schema/order.ts` no tiene ninguna columna de documento del
  comprador, y `src/server/db/schema/user.ts` tampoco. Nadie captura DNI ni RUC
  en ningún punto del flujo.
- `.env.example` no contiene RUC, razón social ni domicilio fiscal de la empresa.
- `docs/specs/014-admin-orders.md` §3 deja fuera explícitamente «reembolsos,
  anulaciones o cualquier llamada a la API de Stripe»: el panel es hoy de solo
  lectura frente a Stripe salvo la cancelación de un pedido `pending`.

Una tienda peruana que cobra está obligada a emitir comprobante electrónico. Este
spec construye esa emisión y, de paso, aporta el hecho económico que los
sub-proyectos #3 (Ingresos v2), #4 (Impuestos) y #6 (Contabilidad) necesitan:
hoy el único dato de venta es `orders.amount_total_cents`, que es lo que Stripe
cobró, no lo que se declara.

El checkout que hay que extender **sin romperlo** es el del spec 007: el
fulfillment vive solo en el webhook (D-4), el stock se valida antes de cobrar
(D-9) y se descuenta sin clamp (D-10), y la idempotencia la da un `UPDATE …
WHERE status = 'pending'` (D-5). Ninguna de esas cuatro propiedades se toca.

**El pago y la emisión quedan desacoplados, pero no automatizados**: el webhook
deja el comprobante en cola y **una persona con permiso lo emite desde
`/admin/orders`**. No existe ningún proceso en segundo plano en este proyecto y
este spec no introduce el primero (D-8).

## 2. Objetivo

Un cliente indica en el checkout si quiere boleta o factura y con qué documento;
su pedido pagado queda con un comprobante en cola sin que el cobro dependa de
Nubefact, y una persona con `invoicing.issue` lo emite desde `/admin/orders` con
un clic, quedando su PDF visible tanto para el cliente en «Mis compras» como para
el equipo en el panel.

## 3. Alcance

### Incluye

- Datos fiscales del comprador en **nuestro** checkout, antes de crear la sesión
  de Stripe: tipo de documento (`dni` / `ruc`), número y, con RUC, razón social.
- Validación **offline** de formato: DNI de 8 dígitos; RUC de 11 dígitos con
  dígito verificador (módulo 11) y prefijo de tipo de contribuyente válido.
- Columnas nuevas en `orders`: `buyer_document_type`, `buyer_document_number`,
  `buyer_legal_name` y `refunded_amount_cents` (esta última la consume 023).
- Tabla nueva `electronic_documents` con su **forma definitiva** (§5.3),
  incluidas las columnas que solo usan 023, #3 y #4.
- Tabla nueva `document_series`: el correlativo por serie, propiedad nuestra, con
  sus 6 filas sembradas por `npm run db:seed`.
- Configuración de emisor y proveedor por variables de entorno, validada al
  arrancar (`src/lib/invoicing-config.ts`).
- Interfaz `InvoicingProvider` y su única implementación `NubefactProvider`.
- Inserción de la fila `pending` **dentro de la transacción del fulfillment**,
  sin ninguna llamada de red añadida al webhook.
- Permiso nuevo `invoicing.issue` (catálogo 27 → 28), solo `super_admin` y
  `admin`, y `POST /api/admin/invoicing/documents/[id]/issue`: **la única puerta
  de emisión**, válida tanto para el primer intento (`pending`) como para
  cualquiera posterior (`failed`).
- `/admin/orders`: los documentos del pedido y su estado dentro del `Sheet` de
  detalle que ya existe, con la acción «Emitir comprobante».
- «Mis compras» (`/account#compras`): el comprobante SUNAT con enlace a su PDF,
  con el recibo de Stripe como recurso de respaldo mientras no esté emitido. Un
  comprobante `failed` **no se le enseña como fallo al cliente**: ve el mismo «se
  está emitiendo» y su recibo, y el badge rojo se queda en el panel (D-21).
- Un producto del catálogo deja de poder costar `0`: `priceCents` exige mayor que
  cero en el POST, en el PATCH y en el formulario (D-22).

### No incluye (explícito)

- **Cualquier proceso en segundo plano.** Sin cron, sin cola, sin `waitUntil()`:
  la emisión la dispara siempre una persona (D-8). El proyecto no tiene hoy
  ningún job programado y este spec no estrena el primero.
- **Emisión en lote** («emitir todos los pendientes»). La acción es por
  documento. §11.
- **Notas de crédito, notas de débito, comunicación de baja y reembolsos.** Son
  el spec 023. Este spec crea su esquema y **no** construye ningún camino que
  escriba esas filas: el único `kind` que se inserta aquí es `boleta` o
  `factura`.
- **Guías de remisión electrónicas.** La tienda no reporta transporte como hecho
  separado de la venta.
- **Validación en línea de RUC/DNI** contra RENIEC o el padrón de SUNAT. Solo
  formato y dígito verificador.
- **Panel de configuración del emisor.** RUC, razón social y domicilio fiscal son
  variables de entorno, no un formulario.
- **Reenvío del comprobante por correo.** No existe proveedor de correo en el
  proyecto; se decide con el resto de notificaciones transaccionales.
- **Multi-serie por sucursal o punto de venta.** Una serie por tipo de documento.
- **Resumen diario de boletas y resumen de anulaciones.** Nubefact los emite
  desde su propio panel; automatizarlos entra, si entra, con 023.
- **Retirar el recibo de Stripe.** `GET /api/orders/[id]/receipt` y
  `order-receipt.service.ts` se quedan exactamente como están (D-14).
- **Cambios en el cálculo de totales, en el stock o en `order_status`.** Ni el
  enum crece ni `calculateOrderTotals` cambia.
- **Backfill de pedidos anteriores.** Un pedido pagado antes de esta migración no
  tiene documento del comprador y **no** se emite; §10.
- **Exportación, PDF propio o almacenamiento de XML/CDR.** Se guardan las URLs
  que devuelve el proveedor, no los archivos.

## 4. Criterios de aceptación

> **Estado al cerrar la implementación: 15 de 28 marcados.** Marcado = verificado
> con evidencia ejecutada (test automatizado, comprobación contra la base real de
> §12, o los cuatro comandos de cierre). Los 13 sin marcar **están
> implementados**, pero su verificación exige o bien credenciales del entorno de
> pruebas de Nubefact —AC10 a AC15— o bien ejercitar la UI y los endpoints por
> HTTP con sesiones de distintos roles —AC18 a AC21, AC23 a AC25—. Ninguno de los
> dos es posible en este entorno; el detalle y lo que falta exactamente están en
> §12. No se marcan por no haberlos visto correr.

- [x] **AC1** — Dado un checkout sin datos fiscales en el cuerpo, cuando se llama
      a `POST /api/checkout`, entonces la respuesta es `400` con `issues` y no se
      crea ninguna fila en `orders`.
- [x] **AC2** — Dado `documentType: 'dni'` con un número que no sean exactamente
      8 dígitos, entonces `400`; dado `documentType: 'ruc'` con 11 dígitos cuyo
      dígito verificador no cuadra por módulo 11, entonces también `400`, y el
      mensaje distingue «longitud» de «número inválido».
- [x] **AC3** — Dado `documentType: 'ruc'` sin `legalName`, entonces `400`; dado
      `documentType: 'dni'` **con** `legalName`, entonces `400`: la razón social
      solo existe en una factura.
- [x] **AC4** — Dado un checkout válido, cuando se crea la orden, entonces
      `orders.buyer_document_type`, `buyer_document_number` y `buyer_legal_name`
      quedan escritos **antes** de llamar a `stripe.checkout.sessions.create`, y
      `refunded_amount_cents` vale `0`.
- [x] **AC5** — Dado `checkout.session.completed` de una orden con RUC, cuando el
      webhook fulfilla, entonces en la **misma transacción** que el `markPaid`
      aparece una fila de `electronic_documents` con `kind = 'factura'`,
      `status = 'pending'`, serie de factura, número correlativo,
      `amount_cents = orders.amount_total_cents`, su `base_cents` + `igv_cents`, y
      `created_by_id = null`.
- [x] **AC6** — Dado el mismo evento entregado dos veces, entonces sigue
      existiendo **una** sola fila de `electronic_documents` para ese pedido, no
      se consume un segundo correlativo y la respuesta es `200`.
- [x] **AC7** — Dado que Nubefact tarda o falla, cuando el webhook procesa el
      pago, entonces el pedido queda `paid` y el stock descontado igual: **el
      handler del webhook no hace ninguna llamada de red al proveedor**.
- [x] **AC8** — Dado un pedido pagado cuya orden no tiene
      `buyer_document_type` (creada antes de la migración), entonces **no** se
      crea ninguna fila de `electronic_documents`, se escribe
      `invoice.skipped` en `audit_logs` con `severity: 'warning'` y el
      fulfillment continúa con normalidad.
- [x] **AC9** — Dado un pedido pagado con su comprobante `pending`, cuando pasa
      el tiempo sin que nadie actúe, entonces el documento **sigue `pending`**:
      no existe ninguna ruta, job ni proceso que lo emita solo, y `grep -r
      "cron"` sobre `src/` y la raíz no devuelve ninguna programación.
- [ ] **AC10** — Dado un documento `pending` y una persona con
      `invoicing.issue`, cuando pulsa «Emitir comprobante» y el proveedor acepta,
      entonces el documento pasa a `issued` con `issued_at`, `pdf_url`,
      `xml_url` y `cdr_url` rellenos, `attempt_count = 1`, y se escribe
      `invoice.issued` en `audit_logs` con el actor y **sin** el número de
      documento del comprador.
- [ ] **AC11** — Dado un fallo transitorio del proveedor (red o `5xx`), entonces
      la respuesta es `502`, el documento queda `failed` con `attempt_count`
      incrementado **una sola vez**, `last_attempt_at` fijado y `last_error` con
      un texto legible, y la acción vuelve a estar disponible de inmediato.
- [ ] **AC12** — Dado un rechazo permanente del proveedor —un cuerpo con `errors`,
      un `4xx` **sin** cuerpo o un `aceptada_por_sunat: false`—, entonces el
      documento queda `failed`, la fila publica `permanentFailure: true` y la UI
      del panel advierte que volver a pulsar sin corregir el dato no lo va a
      arreglar. Los tres casos, no solo el primero: los otros dos no traen ningún
      `errors` que releer y la bandera viaja en `provider_response.permanent`
      (§6.3). Cubierto en ejecución por `nubefact.provider.test.ts`, que emite
      contra un `fetch` doblado y comprueba la traza persistida.
- [ ] **AC13** — Dado un reintento del mismo documento tras un timeout en el que
      Nubefact sí llegó a emitir, entonces se reenvía **la misma serie y el mismo
      número**, la respuesta del proveedor es el documento ya emitido y no se
      genera un duplicado ante SUNAT.
- [ ] **AC14** — Dadas dos personas que pulsan «Emitir comprobante» sobre el
      mismo documento a la vez, entonces una obtiene el documento emitido y la
      otra un `409`: el reclamo se hace con `SELECT … FOR UPDATE` y nadie envía
      dos veces el mismo comprobante.
- [ ] **AC15** — Dado que el proveedor devuelve la respuesta completa, entonces
      `provider_response` guarda **solo** la proyección de §6.6: nunca el token,
      nunca el eco del cuerpo enviado, nunca el documento del comprador.
- [x] **AC16** — Dada cualquier transacción que asigna correlativo, cuando
      revierte, entonces `document_series.last_number` vuelve atrás: no quedan
      huecos por un fallo.
- [x] **AC17** — Dadas dos emisiones simultáneas de la misma serie, entonces
      obtienen números distintos y consecutivos, y el índice único
      `(series, number)` nunca se viola.
- [ ] **AC18** — Dado un usuario con sesión y sin `invoicing.issue`, cuando llama
      a `POST /api/admin/invoicing/documents/[id]/issue`, entonces `403`; sin
      sesión, `401` con `{ message }` y nunca un `307` a HTML.
- [ ] **AC19** — Dado un documento ya `issued`, cuando se pide emitirlo otra vez,
      entonces la respuesta es `409` y nada cambia; dado un id inexistente,
      `404`; dado un id que no es uuid, `400`.
- [ ] **AC20** — Dado un rol `manager` o `audit`, entonces
      `meta.canIssueInvoice` es `false`, el sheet no pinta la acción, un `POST`
      directo responde `403` y **`documents[].pdfUrl` llega `null`**: el enlace al
      PDF exige `invoicing.issue` (D-19). El recorte lo hace el servidor y está
      cubierto en `electronic-document.repository.test.ts`.
- [ ] **AC21** — Dado `GET /api/admin/orders/[id]` con `orders.read`, entonces
      `data.documents` lista los documentos del pedido ordenados por
      `created_at`, y `meta.canIssueInvoice` refleja el permiso resuelto en
      servidor.
- [x] **AC22** — Dada la respuesta de `GET /api/admin/orders/[id]` o de
      `GET /api/orders`, entonces **no** contiene `provider_response`,
      `buyer_document_number` ni `buyer_legal_name` de ningún pedido.
- [ ] **AC23** — Dado un pedido con comprobante `issued`, cuando el cliente abre
      su detalle en `/account#compras`, entonces ve el tipo, la serie-número y un
      `<a href>` real al PDF con `target="_blank"` y
      `rel="noopener noreferrer"`; sin `window.open()` en ningún callback
      asíncrono.
- [ ] **AC24** — Dado un pedido pagado cuyo comprobante sigue `pending` o
      `failed`, entonces el cliente ve «tu comprobante se está emitiendo» y
      conserva el acceso al recibo de Stripe; nunca un enlace roto ni un error. Con
      `failed`, además, **no ve ningún badge de fallo**: el badge rojo y el motivo
      del proveedor son de la vista que puede emitir (D-20, D-21).
- [ ] **AC25** — Dado un pedido `pending`, `payment_failed` o `canceled`,
      entonces no hay comprobante y la vista lo explica, igual que hoy con el
      recibo (spec 008, AC11).
- [x] **AC26** — Dado el desglose de un documento, entonces
      `base_cents + igv_cents === amount_cents` exactamente, con `base_cents`
      calculado como `round(amount / 1.18)` y `igv_cents` como el residuo: el
      IGV nunca se calcula por separado y se cuadra después.
- [x] **AC27** — Dado cualquier importe de cualquier endpoint de este spec,
      entonces es un entero en céntimos; la división por 100 solo ocurre al
      formatear la vista.
- [x] **AC28** — Dado `npm run typecheck && npm run lint && npm run build &&
      npm test`, cuando se ejecuta al cerrar el spec, entonces los cuatro pasan
      en verde.

## 5. Modelo de datos

**Requiere migración.** Dos tablas nuevas, cuatro columnas nuevas en `orders` y
cuatro enums nuevos. La migración generada será `drizzle/0010_*.sql` (verificado:
el último archivo de `drizzle/` es `0009_mixed_mojo.sql`).

### 5.1 `orders` — cuatro columnas nuevas

| Columna | Tipo | Nota |
|---|---|---|
| `buyer_document_type` | `buyer_document_type` enum, **nullable** | `dni` \| `ruc`. Determina boleta vs factura. `null` solo en pedidos anteriores a esta migración |
| `buyer_document_number` | `varchar(11)` nullable | 8 dígitos con `dni`, 11 con `ruc` |
| `buyer_legal_name` | `varchar(160)` nullable | Razón social. Solo con `ruc` |
| `refunded_amount_cents` | `integer` **notNull** default `0` | Suma acumulada de reembolsos. **La escribe el spec 023**; aquí solo nace |

Tres `CHECK`, todos de fila —ninguno mira otra tabla, así que son expresables—:

```ts
// src/server/db/schema/order.ts — entradas nuevas en (t) => [ … ]
    // Los tres datos fiscales viajan juntos o no viajan: un tipo sin número sería
    // un pedido a medio identificar y no hay ningún camino que lo produzca.
    check(
      'orders_buyer_document_pair',
      sql`(${t.buyerDocumentType} is null) = (${t.buyerDocumentNumber} is null)`,
    ),
    // La longitud por tipo sí cabe en un CHECK de fila, a diferencia del invariante
    // cruzado de `stock_movements` (spec 021, D-3): los dos valores están en la misma
    // fila. El dígito verificador del RUC no: es aritmética que vive en Zod (§6.2).
    check(
      'orders_buyer_document_length',
      sql`${t.buyerDocumentNumber} is null
          or (${t.buyerDocumentType} = 'dni' and char_length(${t.buyerDocumentNumber}) = 8)
          or (${t.buyerDocumentType} = 'ruc' and char_length(${t.buyerDocumentNumber}) = 11)`,
    ),
    // Razón social solo en factura. Es lo que impide que una boleta arrastre el
    // nombre de una empresa que nadie validó.
    check(
      'orders_buyer_legal_name_requires_ruc',
      sql`${t.buyerLegalName} is null or ${t.buyerDocumentType} = 'ruc'`,
    ),
    // Nunca se devuelve más de lo cobrado. Lo escribe 023, pero la barrera nace aquí:
    // añadirla después obligaría a validar los datos ya existentes.
    check(
      'orders_refunded_amount_within_total',
      sql`${t.refundedAmountCents} >= 0
          and ${t.refundedAmountCents} <= ${t.amountTotalCents}`,
    ),
```

`buyer_document_type` es **nullable a propósito** y no «notNull con default»: un
default inventaría un DNI para los pedidos históricos. `null` significa
literalmente «este pedido no se puede facturar» y es lo que dispara AC8.

Sin índice nuevo: ninguna consulta filtra por documento del comprador. Buscar un
pedido por RUC es una funcionalidad que nadie ha pedido (§11).

### 5.2 `document_series` — el correlativo es nuestro

```ts
// src/server/db/schema/document-series.ts — nuevo
import { integer, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

// Seis claves y no cuatro: SUNAT exige que la serie de una nota de crédito o de
// débito empiece por la misma letra que el comprobante que modifica —«B» si corrige
// una boleta, «F» si corrige una factura—, así que cada combinación lleva su propio
// correlativo. La comunicación de baja no tiene serie propia: referencia el
// documento que anula (§5.3).
export const documentSeriesKey = pgEnum('document_series_key', [
  'boleta',
  'factura',
  'nota_credito_boleta',
  'nota_credito_factura',
  'nota_debito_boleta',
  'nota_debito_factura',
]);

// Catálogo de 6 filas sembrado por `npm run db:seed`, mismo patrón que
// `transacciones` (spec 020, D-3): PK de texto estable, legible en un JOIN a mano e
// idempotente en el seed sin una columna `code` adicional.
//
// El correlativo vive aquí y no en una secuencia de Postgres **porque una secuencia
// no revierte**: `nextval` consumido dentro de una transacción que después falla deja
// un hueco permanente en la numeración, y un hueco en la correlatividad de
// comprobantes es un problema ante SUNAT, no una curiosidad (D-5, AC16).
export const documentSeries = pgTable('document_series', {
  key: documentSeriesKey('key').primaryKey(),
  // 4 caracteres: una letra de tipo + tres dígitos (`B001`, `F001`).
  series: varchar('series', { length: 4 }).notNull().unique(),
  // 0 = todavía no se emitió ninguno. El primer documento de la serie es el 1.
  lastNumber: integer('last_number').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

`CHECK (last_number >= 0)`.

### 5.3 `electronic_documents`

Es un **árbol**: el original (boleta o factura) y, desde el spec 023, sus
correcciones apuntándolo con `related_document_id`.

```ts
// src/server/db/schema/electronic-document.ts — nuevo
export const electronicDocumentKind = pgEnum('electronic_document_kind', [
  'boleta',
  'factura',
  // Los tres siguientes solo los escribe el spec 023. Nacen aquí para que 023 no
  // necesite migración: añadir un valor a un enum de Postgres es un `ALTER TYPE` que
  // no puede correr dentro de la misma transacción que lo usa, y partirlo en dos
  // migraciones por cada sub-proyecto es exactamente lo que §0 evita.
  'nota_credito',
  'nota_debito',
  'comunicacion_baja',
]);

export const electronicDocumentStatus = pgEnum('electronic_document_status', [
  'pending',
  'issued',
  'failed',
  // `voided`: el original cuando una comunicación de baja suya queda `issued`
  // (spec 023). Ningún camino de este spec lo escribe.
  'voided',
]);

export const electronicDocuments = pgTable(
  'electronic_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`: un comprobante no puede quedar huérfano de su pedido, y un pedido
    // con comprobante emitido no se borra nunca. Varias filas por pedido.
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    // Self-FK `restrict`: `null` en el original, y en una corrección apunta al
    // documento que modifica. Lo escribe 023.
    relatedDocumentId: uuid('related_document_id').references(
      (): AnyPgColumn => electronicDocuments.id,
      { onDelete: 'restrict' },
    ),
    kind: electronicDocumentKind('kind').notNull(),
    // Catálogo 09 (nota de crédito) o 10 (nota de débito) de SUNAT. Lo escribe 023.
    reasonCode: varchar('reason_code', { length: 4 }),
    // Serie y número se asignan **al crear la fila**, no al emitir: es lo que hace
    // que un reintento reenvíe el mismo par y que Nubefact devuelva el documento ya
    // emitido en vez de duplicarlo ante SUNAT (D-6, AC13).
    series: varchar('series', { length: 4 }),
    number: integer('number'),
    // Importe total del documento, IGV incluido. `null` en `comunicacion_baja`, que
    // no lleva importe.
    amountCents: integer('amount_cents'),
    // Desglose exigido por #4 (Impuestos). Se calcula al crear la fila y es el mismo
    // que se envía al proveedor: no es una estimación posterior (§6.4).
    baseCents: integer('base_cents'),
    igvCents: integer('igv_cents'),
    status: electronicDocumentStatus('status').notNull().default('pending'),
    // Fecha real de emisión, exigida por #3 (Ingresos v2). **No se usa `updated_at`**:
    // cualquier cambio futuro de la fila dispara su `$onUpdate` y contaminaría la
    // fecha del libro de ventas.
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    pdfUrl: text('pdf_url'),
    xmlUrl: text('xml_url'),
    cdrUrl: text('cdr_url'),
    // Proyección acotada de la respuesta del proveedor, nunca su cuerpo entero
    // (§6.6, AC15).
    providerResponse: jsonb('provider_response').$type<ProviderTrace>(),
    // Mensaje legible del último fallo, para pintarlo en el panel sin exponer el
    // jsonb. Columna aparte y no `providerResponse.error`: el panel no debe tener
    // que entrar en el volcado del proveedor para decir qué pasó.
    lastError: text('last_error'),
    // Solo si este documento implicó un reembolso en Stripe. Lo escribe 023.
    stripeRefundId: varchar('stripe_refund_id', { length: 255 }),
    // Cuántas veces se ha intentado emitir. No gobierna ningún automatismo —no hay
    // ninguno—: es lo que el panel muestra para que quien decide volver a pulsar sepa
    // cuántas veces se intentó ya.
    attemptCount: integer('attempt_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    // `null` = lo generó el sistema (el original, desde el webhook). Con valor = el
    // administrador que disparó el ajuste (spec 023).
    createdById: uuid('created_by_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('electronic_documents_order_id_idx').on(t.orderId),
    // **Un solo comprobante original *vigente* por pedido.** Es la barrera estructural
    // de la idempotencia del webhook: aunque el `markPaid` condicional fallara en
    // absorber una reentrega, este índice impide la segunda boleta (AC6). Parcial por
    // partida doble: un pedido puede acumular varias correcciones, y el original
    // anulado deja de contar para que el spec 023 pueda **reemitir** tras corregir los
    // datos del comprador. Sin la exclusión de `voided`, corregir un RUC mal tecleado
    // sería imposible sin tocar el esquema.
    uniqueIndex('electronic_documents_one_original_per_order_idx')
      .on(t.orderId)
      .where(sql`${t.kind} in ('boleta', 'factura') and ${t.status} <> 'voided'`),
    // Correlatividad: dos documentos no pueden compartir serie y número. Parcial
    // porque `comunicacion_baja` no tiene serie propia.
    uniqueIndex('electronic_documents_series_number_idx')
      .on(t.series, t.number)
      .where(sql`${t.series} is not null`),
    // Localiza lo que está sin emitir sin recorrer la tabla. No lo usa ningún proceso
    // de este spec —la acción de emisión llega por id—, sino el indicador «pedidos
    // pagados sin comprobante» que construye #3 (Ingresos v2, §4). Se crea aquí porque
    // ya existe la migración y porque, en régimen, es un índice diminuto: casi todas
    // las filas están `issued` y quedan fuera del parcial.
    index('electronic_documents_unissued_idx')
      .on(t.createdAt)
      .where(sql`${t.status} in ('pending', 'failed')`),
    // Lo consumen #3 (Ventas declarables) y #4 (IGV débito fiscal), que agregan por
    // rango de `issued_at`.
    index('electronic_documents_issued_at_idx').on(t.issuedAt.desc()),
  ],
);
```

`CHECK` de la tabla:

```ts
    check('electronic_documents_attempt_count_positive', sql`${t.attemptCount} >= 0`),
    // La baja no lleva importe ni serie propia; todo lo demás sí lleva importe.
    check(
      'electronic_documents_void_has_no_amount',
      sql`(${t.kind} = 'comunicacion_baja') = (${t.amountCents} is null)`,
    ),
    check(
      'electronic_documents_void_has_no_series',
      sql`(${t.kind} = 'comunicacion_baja') = (${t.series} is null)`,
    ),
    check(
      'electronic_documents_series_number_pair',
      sql`(${t.series} is null) = (${t.number} is null)`,
    ),
    // El original no referencia nada; toda corrección referencia algo. Es la
    // invariante del árbol y vive en la base, no solo en el service de 023.
    check(
      'electronic_documents_original_has_no_parent',
      sql`(${t.kind} in ('boleta', 'factura')) = (${t.relatedDocumentId} is null)`,
    ),
    // El desglose viaja entero o no viaja, y siempre cuadra con el total (AC26).
    check(
      'electronic_documents_amount_breakdown',
      sql`(${t.amountCents} is null and ${t.baseCents} is null and ${t.igvCents} is null)
          or (${t.amountCents} > 0
              and ${t.baseCents} > 0
              and ${t.igvCents} >= 0
              and ${t.baseCents} + ${t.igvCents} = ${t.amountCents})`,
    ),
    // `issued_at` existe exactamente cuando el documento está emitido. Sin esto,
    // «Ventas declarables» de #3 podría sumar un documento sin fecha o ignorar uno
    // emitido.
    check(
      'electronic_documents_issued_at_matches_status',
      sql`(${t.status} = 'issued') = (${t.issuedAt} is not null)`,
    ),
```

### 5.4 Catálogo de permisos

No es migración sino `npm run db:seed` (idempotente). El catálogo pasa de **27 a
28** códigos. `orders.refund` lo añade el spec 023 (28 → 29).

```ts
// src/lib/permissions.ts — una entrada nueva en PERMISSIONS
{
  code: 'invoicing.issue',
  resource: 'invoicing',
  action: 'issue',
  description: 'Emitir ante SUNAT un comprobante electrónico pendiente o que falló.',
},
```

El código es `invoicing.issue` y **no** `invoicing.retry`: sin ningún proceso
automático detrás, la primera emisión y la décima son exactamente la misma
acción de la misma persona, y un permiso llamado «reintentar» describiría mal lo
único que hace el sistema para emitir (D-8).

| Rol | `orders.read` | `invoicing.issue` |
|---|---|---|
| `super_admin` | sí | **sí** |
| `admin` | sí | **sí** |
| `manager` | sí | **no** |
| `audit` | sí | **no** |
| `employee`, `customer` | no | no |

Recurso propio (`invoicing`) y no `orders.update_status`: ese permiso lo tiene
`manager` y solo concede cancelar un pedido `pending`. Emitir envía un documento
fiscal a SUNAT con el RUC de la empresa, que es el mismo criterio restrictivo del
resto de finanzas (spec 017, D-3; spec 021, D-6). Ver los documentos y su estado
**no** estrena permiso: reutiliza `orders.read`, que es exactamente el alcance
«ver este pedido entero».

### 5.5 Variables de entorno

```bash
# Emisor (datos fiscales de la empresa). Sin panel de configuración: §3.
INVOICING_COMPANY_RUC=""
INVOICING_COMPANY_LEGAL_NAME=""
INVOICING_COMPANY_ADDRESS=""

# Nubefact (OSE/PSE autorizado SUNAT)
NUBEFACT_API_URL=""
NUBEFACT_API_TOKEN=""

# Series con las que `npm run db:seed` crea las 6 filas de `document_series`.
# Solo las lee el seed: en runtime la serie vigente sale de la tabla.
NUBEFACT_SERIES_BOLETA="B001"
NUBEFACT_SERIES_FACTURA="F001"
NUBEFACT_SERIES_NOTA_CREDITO_BOLETA="BC01"
NUBEFACT_SERIES_NOTA_CREDITO_FACTURA="FC01"
NUBEFACT_SERIES_NOTA_DEBITO_BOLETA="BD01"
NUBEFACT_SERIES_NOTA_DEBITO_FACTURA="FD01"
```

Ningún secreto de planificador: **no hay endpoint que proteger con un secreto
compartido** porque no hay nada que llame a la aplicación desde fuera salvo los
webhooks que ya existen. La única puerta de emisión la autoriza Clerk + RBAC como
el resto del panel.

`src/lib/invoicing-config.ts` lleva `import 'server-only'` y **lanza al
importarse** si falta cualquiera de las cinco primeras, igual que
`src/lib/stripe.ts` con `STRIPE_SECRET_KEY`: un import accidental desde un
componente cliente rompe el build en vez de filtrar el token al bundle.

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| POST | `/api/checkout` | `requireActiveUser()` | **modificado**: `CheckoutInput` gana `buyer` | `{ url }` | 400, 401, 403, 409, 502, 500 |
| GET | `/api/orders` | `requireActiveUser()` | **modificado**: sin cambios de entrada | `OrderHistoryResponse` con `documents` por pedido | 400, 401, 403, 500 |
| GET | `/api/admin/orders/[id]` | `orders.read` | **modificado** | `AdminOrderDetailResponse` con `documents` y `meta.canIssueInvoice` | 400, 401, 403, 404, 500 |
| POST | `/api/admin/invoicing/documents/[id]/issue` | `invoicing.issue` | — | `ElectronicDocumentRow` (200) | 400, 401, 403, 404, 409, 502, 500 |

`POST /api/webhooks/stripe` **no cambia su contrato**: sigue devolviendo
`{ received: true }` y sigue manejando los mismos cuatro eventos. Lo que cambia
está dentro de `order-fulfillment.service.ts`, no en el handler.

### 6.1 `POST /api/checkout` — entrada modificada

```ts
// src/modules/orders/schemas/checkout.schema.ts
import { isValidPeruDocument } from '../lib/peru-document';

export const BUYER_DOCUMENT_TYPES = ['dni', 'ruc'] as const;

export const buyerSchema = z
  .object({
    documentType: z.enum(BUYER_DOCUMENT_TYPES),
    documentNumber: z
      .string()
      .trim()
      .regex(/^\d+$/, 'El documento solo admite dígitos'),
    // `.optional()` y no `.nullable()`: el cuerpo lo produce un formulario, y un
    // campo que no se rellena simplemente no viaja.
    legalName: z.string().trim().min(2).max(160).optional(),
  })
  // Un `superRefine` y no tres `refine` encadenados: los errores tienen que colgar
  // del campo concreto para que React Hook Form los pinte donde se corrigen, mismo
  // criterio que la nota de inventario (spec 021, §6.1).
  .superRefine((value, ctx) => {
    if (!isValidPeruDocument(value.documentType, value.documentNumber)) {
      ctx.addIssue({
        code: 'custom',
        path: ['documentNumber'],
        message:
          value.documentType === 'dni'
            ? 'El DNI son 8 dígitos'
            : 'El RUC son 11 dígitos y el número no es válido',
      });
    }

    const needsLegalName = value.documentType === 'ruc';
    if (needsLegalName === (value.legalName !== undefined)) return;

    ctx.addIssue({
      code: 'custom',
      path: ['legalName'],
      message: needsLegalName
        ? 'La factura necesita la razón social'
        : 'La razón social solo se registra en una factura',
    });
  });

export const checkoutSchema = z.object({
  lines: /* … sin cambios … */,
  buyer: buyerSchema,
});
```

`buyer` es **obligatorio**, no opcional con fallback a boleta anónima: SUNAT
exige identificar al comprador en una boleta a partir de S/ 700 y el catálogo de
esta tienda lo supera con holgura. Pedirlo siempre elimina la rama «boleta sin
documento», que sería la que se olvidaría de probar.

El schema del **formulario** captura texto, como el resto del panel:

```ts
export const buyerFormSchema = z.object({
  documentType: z.enum(BUYER_DOCUMENT_TYPES),
  documentNumber: z.string().trim(),
  legalName: z.string().trim(),
});
// El mismo `superRefine` de arriba, aplicado sobre `legalName === ''` en lugar de
// `undefined`; el mapeo a `undefined` ocurre al construir el cuerpo.
```

### 6.2 Validación offline del documento (pura, con test)

```ts
// src/modules/orders/lib/peru-document.ts — nuevo, módulo puro
/**
 * Dígito verificador del RUC por módulo 11 con los pesos oficiales
 * [5,4,3,2,7,6,5,4,3,2] sobre los 10 primeros dígitos. Es aritmética pública y
 * verificable sin ninguna llamada externa: no confirma que el RUC **exista**, solo
 * que no es un número tecleado al azar (§3, validación offline).
 */
export function isValidRuc(value: string): boolean;

/** Exactamente 8 dígitos. RENIEC no publica un verificador comprobable offline. */
export function isValidDni(value: string): boolean;

export function isValidPeruDocument(type: BuyerDocumentType, value: string): boolean;
```

Reglas normativas, que el test fija:

1. RUC: 11 dígitos; los dos primeros (tipo de contribuyente) deben ser `10`,
   `15`, `17` o `20` —los únicos vigentes—; dígito verificador correcto.
2. DNI: 8 dígitos, y `'00000000'` se rechaza.
3. Ningún valor con espacios, guiones ni letras llega a estas funciones: Zod ya
   aplicó `.trim()` y el `regex` de solo dígitos.

### 6.3 Tipos de salida

```ts
// src/modules/invoicing/types/electronic-document.types.ts
export type ElectronicDocument = InferSelectModel<typeof electronicDocuments>;
export type ElectronicDocumentKind = (typeof electronicDocumentKind.enumValues)[number];
export type ElectronicDocumentStatus = (typeof electronicDocumentStatus.enumValues)[number];

/**
 * Lo que sale por la API, para cliente y para admin **con la misma forma**: no hay
 * ningún campo del documento que el administrador pueda ver y el comprador no —es su
 * propio comprobante— así que dos proyecciones solo crearían dos sitios donde
 * olvidarse de excluir `provider_response` (D-12, AC22).
 */
export type ElectronicDocumentRow = Pick<
  ElectronicDocument,
  'id' | 'kind' | 'status' | 'series' | 'number' | 'amountCents' | 'pdfUrl' | 'attemptCount'
> & {
  /** ISO; `null` mientras no esté emitido. JSON no transporta `Date`. */
  issuedAt: string | null;
  /** Texto del último fallo. `null` salvo en `failed`. */
  lastError: string | null;
  /**
   * `true` cuando el rechazo lo produjo el proveedor y no la red: la UI tiene que poder
   * decir «volver a pulsar no lo arregla» en vez de invitar a un bucle inútil (AC12).
   *
   * Corregido en la revisión de este spec: se lee de `provider_response.permanent` —la
   * clasificación que **escribió el proveedor**— y **no** se recalcula como
   * `errors.length > 0`. El borrador decía lo segundo y era falso en los dos casos que el
   * propio provider marca permanentes sin devolver ningún `errors`: un `4xx` sin cuerpo
   * (token o URL mal) y un `aceptada_por_sunat: false`. En ambos la fila publicaba
   * `permanentFailure: false` e invitaba a un reintento que nunca iba a funcionar. Sigue
   * sin haber columna nueva: la bandera viaja dentro del `jsonb` que ya se persiste (§6.6).
   */
  permanentFailure: boolean;
  /**
   * `B001-00000123`. Derivado en servidor para que la UI no reimplemente el formato.
   *
   * Corregido al implementar T2: el borrador de este spec escribía el ejemplo con
   * **nueve** dígitos de relleno. El correlativo impreso de SUNAT son **ocho**
   * (`F001-00000123`), así que `formatDocumentLabel()` rellena a 8. Es presentación:
   * a Nubefact el número viaja como entero y la columna sigue siendo `integer`.
   */
  label: string | null;
};
```

`base_cents`, `igv_cents`, `xml_url`, `cdr_url`, `provider_response` y
`stripe_refund_id` **no salen por ninguna API de este spec**: el desglose de IGV
es dato del módulo de Impuestos (#4) y se publicará con `finance.read`, no con
`orders.read`. Es el mismo criterio que mantiene `averageCostCents` fuera de
`ProductWithCategory` (spec 021, D-8).

**`pdfUrl` no viaja con `orders.read` a secas** (D-19, corregido en la revisión).
La forma del tipo es la misma para las dos superficies —D-12 no cambia—, pero el
enlace se recorta en servidor según quién pregunta:

| Quién lee | `pdfUrl` | Por qué |
|---|---|---|
| El comprador, en `GET /api/orders` | Sí | Es su propio comprobante, emitido a su nombre |
| `invoicing.issue` (`super_admin`, `admin`), en `GET /api/admin/orders/[id]` | Sí | Es quien emite, y el `POST` de emisión ya le devuelve la fila entera |
| `orders.read` sin `invoicing.issue` (`manager`, `audit`) | `null` | — |

El PDF que sirve Nubefact es una **URL sin sesión**: quien tenga el enlace lo
abre. Y el documento lleva el RUC/DNI y la razón social del comprador —la misma
PII que D-13 mantiene fuera de `audit_logs` precisamente porque `manager` y
`audit` leen la bitácora— más el desglose base/IGV que este mismo apartado
reserva a `finance.read`. Publicarlo bajo `orders.read` habría sido la puerta de
atrás a los dos datos que el resto del spec protege. El recorte vive en
`toRow(document, visibility)` y lo deciden los handlers; el cliente nunca
«oculta» un enlace que ya recibió.

### 6.4 Desglose de IGV (normativo)

```ts
// src/modules/finance/lib/igv.ts — nuevo, módulo puro
export const IGV_RATE = 0.18;

/**
 * Los precios del catálogo son **IGV incluido**, que es como se muestran al público
 * en Perú. Se calcula la base y el IGV es el **residuo**, nunca al revés:
 *
 *   base = round(total / 1.18)
 *   igv  = total − base
 *
 * Calcular `igv = round(total × 0.18 / 1.18)` por separado deja, en algunos
 * importes, `base + igv ≠ total` por un céntimo, y un comprobante que no cuadra
 * consigo mismo lo rechaza SUNAT. El residuo hace que AC26 sea cierto por
 * construcción y no por suerte del redondeo.
 */
export function splitIgv(amountCents: number): { baseCents: number; igvCents: number };
```

Asunción declarada: **todo el catálogo tributa al 18% general**, sin productos
exonerados ni inafectos. Es la misma asunción del diseño de #4 y, a diferencia de
`expenses.igv_cents`, aquí no es una aproximación: es exactamente el desglose que
se envía a Nubefact. Si algún día la tienda vende un producto exonerado, esto es
una revisión de este cálculo y no un defecto oculto (§10).

### 6.5 Interfaz del proveedor

```ts
// src/server/services/invoicing/provider.ts — nuevo
export type IssueDocumentInput = {
  kind: ElectronicDocumentKind;
  series: string;
  number: number;
  issueDate: string;          // 'DD-MM-YYYY' en la zona del emisor
  buyer: { documentType: 'dni' | 'ruc'; documentNumber: string; legalName: string };
  amountCents: number;
  baseCents: number;
  igvCents: number;
  lines: IssueDocumentLine[];
  /** Solo en correcciones (spec 023): el documento que se modifica y el motivo. */
  related?: { kind: ElectronicDocumentKind; series: string; number: number; reasonCode: string };
};

export type IssueDocumentResult = {
  pdfUrl: string | null;
  xmlUrl: string | null;
  cdrUrl: string | null;
  issuedAt: Date;
  trace: ProviderTrace;
};

/**
 * La frontera con el proveedor. Cambiar de Nubefact a otro OSE/PSE debe ser escribir
 * otra clase que implemente esto, no reescribir el service (decisión cerrada con el
 * usuario). Por eso la interfaz habla en céntimos y en `kind` del dominio, y ningún
 * nombre de campo de Nubefact aparece fuera de `nubefact.provider.ts`.
 */
export interface InvoicingProvider {
  issue(input: IssueDocumentInput): Promise<IssueDocumentResult>;
}

/**
 * Fallo del proveedor, con la distinción que la UI necesita (§6.7):
 * `permanent: true` = el documento nunca va a ser aceptado tal cual está (RUC
 * inválido, serie no habilitada, importe incoherente), así que volver a pulsar sin
 * corregir el dato solo gasta cuota. `permanent: false` = red, timeout o 5xx:
 * exactamente lo que sí tiene sentido volver a intentar.
 */
export class InvoicingProviderError extends Error {
  readonly permanent: boolean;
  readonly trace: ProviderTrace;
}
```

`IssueDocumentInput.lines` incluye **una línea por cada `order_items` más una
línea de envío** cuando `orders.shipping_cents > 0`: el total del comprobante es
`amount_total_cents`, que incluye el envío, y un documento cuyas líneas no suman
su total lo rechaza SUNAT.

Precisado al implementar T21: **quien añade la línea de envío es
`toProviderInput()` del service**, no el provider, aunque T21 la mencione. El
provider no ve nunca un pedido —recibe `IssueDocumentInput`, que ya es dominio
cerrado—, así que decidir ahí si hay envío exigiría pasarle `shipping_cents` por
separado y devolverle al proveedor una decisión de negocio que no le toca. Lo que
sí hace el provider, y está probado en `nubefact.provider.test.ts`, es que las
líneas que reciba —envío incluido— sumen exactamente el total del comprobante,
cuadrando el residuo de redondeo en la última.

**Una línea de importe cero se emite con base 0 e IGV 0** (corregido en la
revisión). El caso no es hipotético: aunque el catálogo ya no admite `priceCents: 0`
(D-22), las líneas del comprobante salen de `order_items.price_cents_snapshot`, que
es histórico, así que un pedido anterior a esa regla sigue produciendo una línea de
`totalCents: 0`. Antes esa línea entraba en `splitIgv()`, que exige un entero
positivo, y el `RangeError` resultante **no** es un `InvoicingProviderError`: el
service lo clasificaba como fallo transitorio, dejaba la traza vacía y respondía
`502`, de modo que el correlativo ya asignado se quemaba en cada reintento de algo
que no cambia solo —el precio 0 no se arregla esperando—. Se resuelve sin pasar
por `splitIgv()`, y no omitiendo la línea: el comprobante tiene que enumerar lo
que se entrega, y una línea gratuita con importe 0 cuadra consigo misma y con el
total. Por el mismo motivo el **residuo de redondeo se cuadra en la última línea
que cobra algo**, nunca en una gratuita, que quedaría con un valor de venta que su
propio total contradice. Cubierto con dos casos nuevos en
`nubefact.provider.test.ts`.

### 6.6 Lo que se guarda de la respuesta del proveedor

```ts
// src/server/services/invoicing/provider.ts
/**
 * Proyección **positiva** de la respuesta, con el mismo criterio que las proyecciones
 * del repositorio: se enumera lo que se guarda, no lo que se oculta. La respuesta de
 * Nubefact incluye el eco del cuerpo enviado, y ese eco lleva el documento del
 * comprador; volcarla entera metería PII en una columna que nadie pensó como PII
 * (AC15). El token no aparece en la respuesta, pero tampoco en ningún log: los
 * `console.error` del provider imprimen la URL y el status, jamás las cabeceras.
 */
export type ProviderTrace = {
  acceptedBySunat: boolean | null;
  sunatDescription: string | null;
  sunatNote: string | null;
  hash: string | null;
  errors: string[];
  httpStatus: number | null;
  /**
   * Añadido en la revisión. La clasificación del fallo **tal como la hizo el proveedor**,
   * persistida junto al resto de la traza, que es de donde `toRow()` saca
   * `permanentFailure` (§6.3). La escribe el constructor de `InvoicingProviderError` a
   * partir de su propio `permanent`, así que el error y la fila no pueden decir cosas
   * distintas. `false` en la traza de una respuesta aceptada: no hubo fallo que clasificar.
   */
  permanent: boolean;
};

export function toProviderTrace(payload: unknown, httpStatus: number | null): ProviderTrace;
```

`toProviderTrace()` devuelve siempre `permanent: false`: la regla que decide si un
fallo es permanente es del proveedor concreto —Nubefact devuelve rechazos con HTTP
`200` (§6.6.1, diferencia 2)— y no de esta traducción. No es PII ni un secreto:
es un booleano que la UI ya iba a mostrar.

#### 6.6.1 T1 — contraste con la API de Nubefact y diferencias encontradas

Contrastado antes de escribir `nubefact.provider.ts`. **Salvedad honesta**: este
entorno de desarrollo no tiene salida a internet, así que el contraste se hizo
contra la especificación documentada del API de Nubefact (`operacion:
"generar_comprobante"`, autenticación por token, catálogos SUNAT 01/03/06) y no
contra una petición real. Lo que T38 verifica de punta a punta contra el entorno
de pruebas es justamente esto; cualquier divergencia se corrige ahí y se anota
aquí.

Mapeo real del cuerpo (`POST <NUBEFACT_API_URL>`, cabecera
`Authorization: Token token="<NUBEFACT_API_TOKEN>"`):

| Campo del dominio (§6.5) | Campo de Nubefact | Nota |
|---|---|---|
| — | `operacion` | Literal `"generar_comprobante"` |
| `kind` | `tipo_de_comprobante` | Catálogo 01: `1` factura, `2` boleta, `3` nota de crédito, `4` nota de débito |
| `series` | `serie` | Texto tal cual (`F001`) |
| `number` | `numero` | Entero, sin ceros a la izquierda |
| `issueDate` | `fecha_de_emision` | `DD-MM-YYYY`, como ya decía §6.5 |
| `buyer.documentType` | `cliente_tipo_de_documento` | Catálogo 06: `1` DNI, `6` RUC. **No** son las cadenas `'dni'`/`'ruc'` |
| `buyer.documentNumber` | `cliente_numero_de_documento` | |
| `buyer.legalName` | `cliente_denominacion` | |
| `baseCents` | `total_gravada` | En **soles con decimales**, no en céntimos |
| `igvCents` | `total_igv` | Ídem |
| `amountCents` | `total` | Ídem |
| — | `moneda` | `1` = PEN |
| — | `porcentaje_de_igv` | `18.00` |
| — | `sunat_transaction` | `1` = venta interna |
| — | `enviar_automaticamente_a_la_sunat` | `true`: sin esto el documento se queda en Nubefact sin llegar a SUNAT |
| `lines[]` | `items[]` | `unidad_de_medida` (`NIU`), `descripcion`, `cantidad`, `valor_unitario` (sin IGV), `precio_unitario` (con IGV), `subtotal`, `tipo_de_igv` (`1` gravado oneroso), `igv`, `total` |
| `related` | `documento_que_se_modifica_tipo` / `_serie` / `_numero` + `tipo_de_nota_de_credito` | Solo lo usa el spec 023 |

Respuesta: `enlace_del_pdf`, `enlace_del_xml`, `enlace_del_cdr`,
`aceptada_por_sunat`, `sunat_description`, `sunat_note`, `codigo_hash`.

**Tres diferencias respecto de lo que este spec daba por supuesto**, y las tres
cambian el código:

1. **`errors` no es un array, es una cadena.** Nubefact devuelve
   `{ "errors": "El campo serie es obligatorio" }`. `ProviderTrace.errors` se
   queda como `string[]` —es la forma que la UI consume y la que absorbe un
   proveedor futuro que sí mande varios—, pero `toProviderTrace()` **normaliza**
   `string | string[] | unknown` a `string[]`, en vez de castear.
2. **Un rechazo de validación puede llegar con HTTP `200`.** Clasificar
   permanente vs. transitorio **solo** por el status sería incorrecto: la regla
   normativa pasa a ser «hay `errors` en el cuerpo ⇒ permanente», y el status
   solo decide cuando el cuerpo no trae `errors` (`5xx`/red ⇒ transitorio,
   `4xx` ⇒ permanente).
3. **Los importes viajan en soles con decimales, no en céntimos.** La frontera
   de §6.5 sigue hablando en céntimos —es dominio— y la división por 100 ocurre
   **dentro** de `nubefact.provider.ts`, que es el único archivo al que AC27 le
   permite dividir además de la vista.

Cuarta anotación, menor: `cliente_direccion` y `cliente_email` son opcionales y
**no se envían**. La dirección de `orders.shipping_address` es de envío, no
fiscal, y mandarla como domicilio del cliente sería afirmar un dato que nadie
validó.

### 6.7 Reclamo del documento y clasificación del fallo (normativo)

No hay cola ni lote: la acción llega con el **id del documento**. Lo único que
hay que resolver es que dos personas no lo envíen a la vez.

```sql
-- Dentro de la transacción de reclamo. `FOR UPDATE` serializa a dos administradores
-- que pulsen el botón a la vez: el segundo espera, ve el estado ya `issued` y recibe
-- un 409 (AC14). No hace falta `SKIP LOCKED` —no se recorre ninguna cola— y esperar
-- es aquí el comportamiento correcto.
select *
from electronic_documents
where id = $1 and status in ('pending', 'failed')
for update
```

Clasificación del resultado, en `electronic-document.service.ts`:

| Resultado de `provider.issue()` | Estado | Efecto en la UI |
|---|---|---|
| Éxito | `issued`, con `issued_at` y las tres URLs | La acción desaparece; aparece el enlace al PDF |
| `InvoicingProviderError` con `permanent: false` | `failed`, `attempt_count + 1`, `last_error` | «No se pudo contactar con el proveedor. Vuelve a intentarlo» |
| `InvoicingProviderError` con `permanent: true` | `failed`, `attempt_count + 1`, `last_error` | «SUNAT rechazó el comprobante: <motivo>. Corrige el dato antes de volver a emitir» |

`attempt_count` se incrementa **al reclamar**, no al terminar: si el proceso
muere a mitad de la llamada HTTP, el intento ya quedó contado y quien mire la
pantalla ve que algo se intentó. No gobierna ningún límite —no hay automatismo
que limitar (D-8)—; es información para la persona que decide.

## 7. Arquitectura y archivos afectados

- `src/lib/electronic-documents.ts` — **nuevo**: catálogo puro (kinds, estados,
  claves de serie, etiquetas, `seriesKeyFor()`, `formatDocumentLabel()`). Sin
  imports de servidor, mismo criterio que `src/lib/permissions.ts` y
  `src/lib/inventory-transactions.ts`.
- `src/lib/permissions.ts` — `invoicing.issue` (27 → 28) y su fila en la matriz.
- `src/lib/invoicing-config.ts` — **nuevo**: `import 'server-only'`, lee y valida
  las variables de §5.5 al importarse.
- `src/server/db/schema/order.ts` — cuatro columnas y cuatro `CHECK` (§5.1).
- `src/server/db/schema/document-series.ts` — **nuevo** (§5.2).
- `src/server/db/schema/electronic-document.ts` — **nuevo** (§5.3).
- `src/server/db/schema/index.ts` — barrel.
- `drizzle/0010_*.sql` — **nuevo**: migración generada.
- `src/server/db/seed.ts` — siembra las 6 filas de `document_series`.
- `src/server/repositories/document-series.repository.ts` + `.test.ts` — **nuevo**.
- `src/server/repositories/electronic-document.repository.ts` + `.test.ts` — **nuevo**.
- `src/server/repositories/order.repository.ts` — `create()` acepta los campos del
  comprador por inferencia; `HISTORY_ORDER_COLUMNS` y las proyecciones de admin
  **no cambian** (los datos fiscales no se publican, AC22).
- `src/server/services/invoicing/provider.ts` — **nuevo**: interfaz, tipos,
  `InvoicingProviderError`, `toProviderTrace()`.
- `src/server/services/invoicing/nubefact.provider.ts` + `.test.ts` — **nuevo**.
- `src/server/services/invoicing/index.ts` — **nuevo**: `getInvoicingProvider()`.
- `src/server/services/electronic-document.service.ts` + `.test.ts` — **nuevo**:
  `queueOriginalDocument(tx, order, items)` y `issueDocument(actor, id)`.
- `src/server/services/checkout.service.ts` — persiste el comprador en `orders`.
- `src/server/services/order-fulfillment.service.ts` — llama a
  `queueOriginalDocument` dentro de la transacción del `markPaid`.
- `src/app/api/checkout/route.ts` — sin cambios (el schema ya valida el `buyer`).
- `src/app/api/webhooks/stripe/route.ts` — **sin cambios**.
- `src/app/api/admin/invoicing/documents/[id]/issue/route.ts` — **nuevo**: `POST`.
- `src/app/api/admin/orders/[id]/route.ts` — `data.documents` y
  `meta.canIssueInvoice`.
- `src/app/api/orders/route.ts` — documentos por pedido, en una sola consulta.
- `.env.example` — las variables de §5.5.
- `src/modules/orders/lib/peru-document.ts` + `.test.ts` — **nuevo**.
- `src/modules/orders/schemas/checkout.schema.ts` + `.test.ts` — `buyer` (§6.1).
- `src/modules/orders/types/order.types.ts` — `documents` en `OrderHistoryEntry`
  y en `AdminOrderDetail`.
- `src/modules/orders/components/checkout-summary.tsx` — formulario del comprador.
- `src/modules/orders/components/order-detail-dialog.tsx` — comprobante SUNAT.
- `src/modules/orders/components/admin-order-detail-sheet.tsx` — bloque de
  documentos y acción «Emitir comprobante».
- `src/modules/finance/lib/igv.ts` + `.test.ts` — **nuevo** (§6.4).
- `src/modules/invoicing/` — **módulo nuevo**: `constants.ts`,
  `types/electronic-document.types.ts`, `services/invoicing.service.ts` (axios),
  `hooks/use-issue-document.ts`, `components/document-status-badge.tsx`,
  `components/order-documents.tsx`, `components/buyer-document-fields.tsx`.
- `src/components/ui/radio-group.tsx` — **nuevo**: `npx shadcn@latest add radio-group`
  (verificado: no está en `src/components/ui/`).
- `docs/SETUP.md` — §5.3 (tablas nuevas) y §6 (módulo construido).

**Ningún archivo de configuración de despliegue**: no se crea `vercel.json` ni se
añade ningún script a `package.json`. La aplicación sigue sin tener nada
programado.

Flujo, capa por capa, sin saltos:

```
CheckoutSummary ("use client", RHF)
  └─ useCreateCheckout()        → checkout.service (axios)
      └─ POST /api/checkout     requireActiveUser · Zod (lines + buyer)
          └─ checkout.service (servidor)
              └─ tx: relee precios · crea orden CON datos fiscales · crea líneas
              └─ stripe.checkout.sessions.create()

Stripe ──► POST /api/webhooks/stripe        (handler sin cambios)
             └─ order-fulfillment.service
                 └─ tx: markPaid · decrementStock · logAudit
                      · document-series.repository.nextNumber()
                      · electronic-document.repository.create(pending)   ← NUEVO
                 (y aquí se detiene: nada emite todavía)

AdminOrderDetailSheet → useIssueDocument → invoicing.service (axios)
  └─ POST /api/admin/invoicing/documents/[id]/issue   authorize('invoicing.issue')
      └─ electronic-document.service.issueDocument()
          ├─ tx A: reclama (SELECT … FOR UPDATE, attempt_count++)
          ├─ (sin transacción) NubefactProvider.issue()
          └─ tx B: markIssued | markFailed + logAudit
```

### 7.1 Firmas del repositorio

```ts
// src/server/repositories/document-series.repository.ts — nuevo

/**
 * `UPDATE … SET last_number = last_number + 1 … RETURNING series, last_number`, y no
 * un `SELECT` seguido de un `UPDATE`: el UPDATE toma el lock de fila, así que dos
 * emisiones simultáneas de la misma serie se serializan en el motor y salen con
 * números distintos y consecutivos (AC17). Exige `Tx` —nunca el `db` global— porque el
 * número solo debe consumirse si la fila del documento llega a existir (AC16).
 */
export async function nextNumber(
  tx: Tx,
  key: DocumentSeriesKey,
): Promise<{ series: string; number: number }>;
```

```ts
// src/server/repositories/electronic-document.repository.ts — nuevo

export async function create(tx: Tx, values: NewElectronicDocument): Promise<ElectronicDocument>;

/**
 * Reclama el documento emitible con el `SELECT … FOR UPDATE` de §6.7 e incrementa su
 * `attempt_count` y su `last_attempt_at` en el mismo viaje. `null` si el documento no
 * existe o ya no es emitible: el handler distingue el 404 del 409 releyendo con el
 * mismo `tx`.
 */
export async function claimForIssue(tx: Tx, id: string): Promise<ElectronicDocument | null>;
// Anotado al implementar T18: son **dos sentencias** dentro de la misma transacción —el
// `SELECT … FOR UPDATE` y el `UPDATE` del `attempt_count`—, no una sola con un CTE
// `for update`. El CTE obliga a `tx.execute()` con SQL en crudo, que devuelve las filas
// en `snake_case` y exigiría mapear a mano las 23 columnas: justo la duplicación que la
// inferencia del schema existe para evitar (docs/SETUP.md §4, regla dura 5). El coste es
// un viaje más sobre la conexión que la transacción ya tiene abierta, dentro de una
// transacción que no hace ninguna llamada de red. El lock y la serialización de AC14 son
// idénticos: los da el `FOR UPDATE`, que sigue estando literal.

/**
 * `UPDATE … WHERE id = $1 AND status <> 'issued' RETURNING *`. El guard va en el
 * `WHERE`, no en un `if` previo: es lo que impide que dos emisiones concurrentes
 * escriban dos veces el mismo documento emitido.
 */
export async function markIssued(tx: Tx, id: string, values: IssuedValues): Promise<ElectronicDocument | null>;

export async function markFailed(tx: Tx, id: string, values: FailedValues): Promise<ElectronicDocument>;

export async function findById(id: string, reader?: Reader): Promise<ElectronicDocument | null>;

/**
 * Una sola consulta con `inArray` para todos los pedidos de la página, no una por
 * pedido: el historial trae hasta 60 cabeceras y la versión ingenua serían 60 viajes al
 * pool serverless. Mismo patrón que `loadItemsByOrder` (spec 008, §10).
 */
export async function findRowsByOrderIds(
  orderIds: string[],
  visibility: RowVisibility,
  reader?: Reader,
): Promise<Map<string, ElectronicDocumentRow[]>>;

/**
 * `RowVisibility` es `{ includePdfUrl: boolean }` y es **obligatorio**, no un opcional con
 * default permisivo: quien lee documentos tiene que declarar bajo qué permiso lo hace, y el
 * día que aparezca un tercer llamador el typecheck le obliga a decidir en vez de heredar el
 * caso más abierto (D-19).
 */
```

### 7.2 El punto exacto de inserción en el fulfillment

```ts
// src/server/services/order-fulfillment.service.ts — dentro de fulfillCheckoutSession
  await db.transaction(async (tx) => {
    const paid = await orderRepository.markPaid(tx, orderId, { … });
    if (!paid) return;                       // reentrega: sin cambios (D-5)

    const order = await orderRepository.findByIdWithItems(orderId, tx);
    if (order) await decrementStockAndAudit(tx, order.items, session, eventId, orderId);

    // NUEVO. Dentro de la misma transacción y **sin ninguna llamada de red**: lo único
    // que hace es consumir un correlativo e insertar una fila `pending` (AC7). Deja el
    // comprobante listo para que alguien lo emita desde el panel; no lo emite (D-8).
    // Si algo aquí lanzara, revertiría también el `markPaid` y Stripe reintentaría el
    // evento, que es el comportamiento correcto: un pedido cobrado sin comprobante en
    // cola es peor que un reintento.
    await queueOriginalDocument(tx, paid, order?.items ?? [], { eventId, sessionId: session.id });

    await logAudit(tx, { action: 'order.paid', … });   // sin cambios
  });
```

```ts
// src/server/services/electronic-document.service.ts — nuevo
/**
 * `null` en `buyerDocumentType` = pedido anterior a la migración `0010`. No se inventa
 * ningún documento: se deja constancia y el fulfillment sigue (AC8). Es la única rama
 * que no encola, y existe porque la alternativa —emitir una boleta a nombre de nadie—
 * sería un comprobante falso ante SUNAT.
 */
export async function queueOriginalDocument(tx, order, items, source): Promise<void> {
  if (!order.buyerDocumentType || !order.buyerDocumentNumber) {
    await logAudit(tx, {
      actorId: null,
      action: 'invoice.skipped',
      entityType: 'order',
      entityId: order.id,
      severity: 'warning',
      metadata: { reason: 'missing_buyer_document', ...source },
    });
    return;
  }

  const kind = order.buyerDocumentType === 'ruc' ? 'factura' : 'boleta';
  const { series, number } = await documentSeriesRepository.nextNumber(tx, kind);
  const { baseCents, igvCents } = splitIgv(order.amountTotalCents);

  const document = await electronicDocumentRepository.create(tx, {
    orderId: order.id, kind, series, number,
    amountCents: order.amountTotalCents, baseCents, igvCents,
    status: 'pending', createdById: null,
  });

  // Sin el documento del comprador ni su razón social: `audit` lee la bitácora y esos
  // datos son PII del cliente, no del pedido (D-13).
  await logAudit(tx, {
    actorId: null,
    action: 'invoice.queued',
    entityType: 'electronic_document',
    entityId: document.id,
    metadata: { orderId: order.id, kind, series, number, ...source },
  });
}
```

#### 7.2.1 Cuatro cosas que T23 tuvo que decidir y el spec no fijaba

1. **Segundo motivo de `invoice.skipped`.** Además del pedido sin documento del
   comprador (AC8), se salta el pedido con `amount_total_cents <= 0`. No es un
   caso hipotético: el envío puede ser gratis y un pedido anterior a D-22 puede
   llevar líneas a precio 0 en su snapshot, que es histórico y no lo cambia una
   regla nueva del catálogo. Sin el guard, `splitIgv()` lanzaría **dentro de la
   transacción del webhook**, revertiría el `markPaid` y Stripe reintentaría el
   evento para
   siempre. El motivo viaja como `reason: 'non_positive_amount'` y la rama es la
   misma, así que no estrena concepto: `skipReason()` devuelve el motivo en vez de
   un booleano justamente para que la bitácora no pueda decir una razón distinta
   de la que decidió.
2. **Denominación del comprador en una boleta.** `orders.buyer_legal_name` solo
   existe con RUC (§5.1), pero el proveedor exige `cliente_denominacion` también
   en la boleta. `resolveBuyerName()` resuelve razón social → nombre de Clerk →
   correo, y **nunca** inventa un «CLIENTE VARIOS», que sería declarar una venta a
   nadie. El correo como último recurso es dato del propio comprador en su propio
   comprobante.
3. **`orderRepository.findFiscalSnapshot()`, lectura nueva.** Es la única
   proyección del repositorio que publica `buyer_document_number` y
   `buyer_legal_name`, y vive aparte por la razón contraria a la habitual: tiene
   un solo llamador —este service— y ninguna API la devuelve (AC22). Las
   proyecciones de admin y de historial siguen exactamente como estaban.
4. **`fecha_de_emision` es hoy, no la fecha de la fila.** Es el día en que el
   comprobante se emite de verdad, resuelto en `America/Lima` con
   `src/lib/reporting.ts`; con emisión manual entre el cobro y la emisión pueden
   pasar días (D-8). Lo que evita el duplicado en un reintento es el par
   serie-número (D-6), que no depende de la fecha.

5. **`getInvoicingProvider()` carga el proveedor con `import()` dinámico.**
   Descubierto al enganchar T24: con un import estático, la cadena
   `nubefact.provider → invoicing-config` entra en el grafo de
   `order-fulfillment.service.ts`, es decir, en el del **webhook de Stripe**, y
   como `invoicing-config` lanza al importarse si falta una variable (D-18), un
   despliegue sin credenciales de Nubefact dejaría de fulfillar pedidos pagados
   —bastante peor que no poder emitir—. Encolar no necesita al proveedor (AC7),
   así que tampoco su configuración. La prueba de que quedó desacoplado es que
   `order-fulfillment.service.test.ts` **no** necesita mockear
   `@/lib/invoicing-config`, mientras que los tests del provider y del service de
   emisión sí.

**Punto abierto que T38 tiene que cerrar**: qué devuelve exactamente Nubefact al
reenviar un par serie-número que ya emitió. AC13 supone que devuelve el documento
ya emitido; si en su lugar devuelve un `errors` de «comprobante duplicado», la
clasificación de §6.7 lo marcaría como rechazo **permanente** y la fila quedaría
`failed` para siempre pese a existir ante SUNAT. No se implementa ninguna rama
contra ese supuesto sin haberlo observado: es el tercer escenario de T38 y, si se
confirma, el arreglo es una rama explícita en `isPermanentFailure()`.

### 7.3 Forma del handler de emisión

```ts
// src/app/api/admin/invoicing/documents/[id]/issue/route.ts — nuevo
type Context = RouteContext<'/api/admin/invoicing/documents/[id]/issue'>;

export async function POST(request: Request, context: Context) {
  try {
    // Mismo preámbulo que el resto de /api/admin: la verificación corre dentro del
    // recurso (CLAUDE.md regla 8), nunca en `proxy.ts`, y nunca `auth.protect()`.
    const { actor } = await authorize('invoicing.issue');

    const { id } = await context.params;
    const parsedId = documentIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_DOCUMENT_ID);

    // Sin cuerpo: la acción no tiene parámetros. Todo lo que hace falta para emitir
    // —serie, número, importes, comprador— está en la fila desde que se creó (D-6).
    const document = await issueDocument(actor, parsedId.data, getAuditContext(request));

    return NextResponse.json(document);
  } catch (error) {
    // El 404, el 409 de «ya emitido» y el 502 del proveedor salen de aquí sin un solo
    // `if` nuevo: el service lanza `NotFoundError`, `ConflictError` y `UpstreamError`.
    return toErrorResponse(error, {
      label: 'POST /api/admin/invoicing/documents/[id]/issue',
      fallback: 'No se pudo emitir el comprobante',
    });
  }
}
```

**Con service** y no con la lógica en el handler, a diferencia del costo inicial
del spec 021 (§7.2): esta operación cruza dos repositorios, un proveedor externo,
dos transacciones y la bitácora. Es el caso que `docs/SETUP.md` §3 asigna a
`server/services/`.

### 7.4 La llamada al proveedor nunca ocurre dentro de una transacción

```ts
// src/server/services/electronic-document.service.ts
export async function issueDocument(actor, id, auditContext): Promise<ElectronicDocumentRow> {
  // tx A — reclamo. Corta: incrementa el intento y suelta el lock.
  const claimed = await db.transaction((tx) => electronicDocumentRepository.claimForIssue(tx, id));
  if (!claimed) throw await explainNotIssuable(id);   // NotFoundError o ConflictError

  let result: IssueDocumentResult;
  try {
    // **Fuera de toda transacción.** Una llamada HTTP dentro de `db.transaction`
    // mantiene abierta una conexión del pool serverless de Neon durante segundos,
    // compitiendo con las peticiones de la tienda por un recurso escaso. Además, un
    // timeout del proveedor revertiría el `attempt_count` y la pantalla mostraría
    // «0 intentos» después de haber intentado (D-9).
    result = await getInvoicingProvider().issue(toProviderInput(claimed));
  } catch (error) {
    // tx B' — el fallo se persiste igual, con su clasificación, y después se propaga
    // como `UpstreamError` para que el handler responda 502 (AC11).
    return persistFailure(claimed, error, actor, auditContext);
  }

  // tx B — éxito.
  return persistSuccess(claimed, result, actor, auditContext);
}
```

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: Nubefact detrás de la interfaz `InvoicingProvider` | Llamar al API del proveedor desde el service | Decisión cerrada con el usuario en el brainstorming. La interfaz es barata —un método y dos tipos— y su valor es concreto: hoy ningún nombre de campo de Nubefact aparece fuera de `nubefact.provider.ts`, así que un cambio de OSE/PSE no toca el service, el repositorio ni la UI. Sin ella, el mapeo del proveedor se filtraría al service y el cambio sería una reescritura |
| **D-2**: El documento del comprador se captura en **nuestro** checkout, antes de crear la sesión de Stripe | Recogerlo en la página alojada de Stripe con `custom_fields` | Decisión cerrada con el usuario. Además es la única que funciona: `custom_fields` de Stripe no valida dígito verificador ni condiciona un campo a otro (razón social solo con RUC), y el dato solo llegaría en el webhook —es decir, después de cobrar—, cuando ya es tarde para decirle al cliente que su RUC está mal |
| **D-3**: `buyer` es obligatorio en `POST /api/checkout` | Opcional, con boleta anónima por defecto | La boleta sin identificar solo es válida por debajo de S/ 700 y el catálogo lo supera con holgura. Una rama opcional sería la que nadie prueba y la que, el día que se use, emite un comprobante que SUNAT observa. El coste es un campo más en el checkout, no una decisión de arquitectura |
| **D-4**: El estado de reembolso se deriva de `refunded_amount_cents` vs `amount_total_cents` | Añadir `refunded` / `partially_refunded` al enum `order_status` | Decisión cerrada con el usuario. Un valor nuevo en el enum se solaparía con `paid` —un pedido parcialmente reembolsado **sigue** pagado— y obligaría a revisar los cuatro sitios que hoy comparan contra `'paid'`: el dashboard (spec 015), el historial (spec 008), la boleta de Stripe y el filtro del panel. La resta es una derivación, no un estado |
| **D-5**: El correlativo vive en `document_series` con `UPDATE … RETURNING` | Una secuencia de Postgres (`nextval`), o `MAX(number) + 1` | `nextval` **no revierte**: un consumo dentro de una transacción que después falla deja un hueco permanente en la correlatividad de comprobantes, que es un problema ante SUNAT y no una curiosidad (AC16). `MAX + 1` no es lockeable y produce duplicados bajo concurrencia. El `UPDATE` toma el lock de fila, revierte con la transacción y da números consecutivos (AC17). El precio son seis filas de catálogo, sembradas con el mismo mecanismo que `transacciones` |
| **D-6**: Serie y número se asignan **al crear** la fila, no al emitir | Asignarlos cuando el proveedor responde, o dejar que el proveedor los asigne | Es la idempotencia del reintento (AC13). Si un timeout corta la respuesta de un documento que Nubefact sí emitió, el siguiente intento manda **el mismo** par serie-número y el proveedor devuelve el documento ya existente en vez de crear un duplicado ante SUNAT. Con el número asignado después, cada intento sería un comprobante nuevo y la tienda acabaría declarando ventas que no ocurrieron. Delegar la numeración en el proveedor añade además una dependencia de su comportamiento exacto que no podemos verificar desde el repositorio. Es también lo que hace que la acción del panel pueda pulsarse sin miedo |
| **D-7**: La fila `pending` se inserta **dentro** de la transacción del fulfillment | Insertarla después del `COMMIT`, o derivar «qué falta emitir» comparando pedidos `paid` contra documentos existentes | La inserción no hace ninguna llamada de red: son dos consultas cortas sobre la misma conexión que ya está abierta, así que no compite con el límite de ~10 s del webhook (AC7). Fuera de la transacción, un fallo entre el `COMMIT` y el `INSERT` dejaría un pedido cobrado sin comprobante en cola y sin nada que lo detecte. Derivarlo al vuelo sería una segunda fuente de verdad sobre «qué hay que emitir», y la primera pregunta de cualquier bug sería cuál de las dos tiene razón. Además, sin la fila creada no habría dónde reservar el correlativo (D-6) |
| **D-8**: **La emisión la dispara una persona** desde `/admin/orders`; no existe ningún proceso automático | Un Vercel Cron sobre un handler protegido por `CRON_SECRET`; `waitUntil()` tras el webhook; una cola externa (QStash, Inngest); o emitir dentro del propio webhook | Decisión del usuario, y el código la respalda: verificado que el proyecto **no tiene hoy ningún mecanismo de job** —sin `vercel.json`, sin script de cron en `package.json`, sin carpeta de jobs—, así que un cron no sería «usar lo que ya hay» sino estrenar una categoría de infraestructura entera, con su secreto compartido, su endpoint sin sesión, su ventana de solapamiento y su dependencia del plan de Vercel. La emisión de un comprobante fiscal es además una acción con responsable: que quede registrado **quién** la disparó (`audit_logs.actor_id`) es más valioso aquí que ahorrarle un clic. `waitUntil()` no reintenta y pierde el trabajo; una cola externa resuelve un problema de volumen que esta tienda no tiene; emitir dentro del webhook es justo lo que la emisión desacoplada descarta. El precio —un comprobante puede quedarse sin emitir si nadie mira— está en §10 y se mitiga haciéndolo visible en el propio pedido |
| **D-9**: La llamada al proveedor ocurre **fuera** de toda transacción, entre dos transacciones cortas | Una sola transacción que envuelva reclamo, llamada y persistencia | Una transacción abierta durante una llamada HTTP retiene una conexión del pool serverless de Neon varios segundos, compitiendo con las peticiones de la tienda por un recurso escaso. Peor: un timeout revertiría el `attempt_count`, así que la pantalla mostraría «0 intentos» después de haber intentado y nadie sabría que el documento ya salió una vez |
| **D-10**: Una sola acción, `issue`, para el primer intento y para todos los siguientes | Un endpoint «emitir» y otro «reintentar», o un permiso `invoicing.retry` | Sin automatismo detrás, emitir por primera vez y volver a emitir son literalmente la misma operación sobre la misma fila: mismo reclamo, mismo payload, mismo par serie-número (D-6). Dos endpoints serían dos copias de lo mismo con un `if` de estado distinto, y el estado ya vive en el `WHERE` del reclamo. El nombre del permiso sigue al hecho: `invoicing.issue` |
| **D-11**: Un módulo nuevo `src/modules/invoicing/` | Meterlo todo en `src/modules/orders/` | `orders` ya tiene 43 archivos y cubre tres superficies (checkout, historial de cliente, panel). La facturación es un dominio propio con sus tipos, su estado y su permiso, exactamente como lo fueron `inventory`, `finance` y `payroll`, que también nacieron como módulos separados en vez de crecer dentro de `products`. Las tres superficies que se tocan —resumen del checkout, diálogo del historial, sheet del panel— se quedan donde están y **consumen** componentes de `invoicing` |
| **D-12**: Una sola proyección `ElectronicDocumentRow` para cliente y para admin | Una proyección de cliente y otra de admin | No hay ningún campo del comprobante que el administrador pueda ver y el comprador no: es el comprobante del comprador. Dos proyecciones idénticas serían dos sitios donde olvidarse de excluir `provider_response`, y el olvido no rompería ningún test. Lo que sí difiere es la **acción** (`canIssueInvoice`), y eso vive en `meta`, no en la fila |
| **D-13**: La bitácora registra pedido, tipo, serie, número y **actor**; nunca el documento del comprador ni su razón social | `changes: { after: { buyerDocumentNumber, buyerLegalName } }` | Mismo criterio que el costo inicial (spec 021, D-10) y que los salarios (spec 018, D-4): `audit` y `manager` tienen `audit_logs.read` y la vista de bitácora renderiza `changes` y `metadata` íntegros. Un DNI por cada venta convertiría `/admin/audit-logs` en el padrón de clientes de la tienda. La trazabilidad que hace falta —qué documento se emitió, para qué pedido, quién lo emitió y con qué resultado— queda entera con `entityId`, `actorId`, `series` y `number` |
| **D-14**: El recibo de Stripe se **conserva** junto al comprobante SUNAT | Sustituirlo por el comprobante en cuanto exista | Son dos cosas distintas: el comprobante es el documento fiscal; el recibo de Stripe es la constancia del cargo, con el medio de pago y los últimos cuatro dígitos, que es lo que el cliente busca cuando reclama al banco. Además cubre la ventana en que el comprobante aún está `pending` (AC24) sin inventar un estado vacío, y esa ventana es ahora más larga porque depende de que alguien pulse el botón (D-8). `order-receipt.service.ts` no se toca: cero riesgo sobre un camino que ya funciona |
| **D-15**: `base_cents` se calcula como `round(total / 1.18)` y el IGV es el **residuo** | Calcular los dos por separado a partir del total | Calcularlos por separado deja, en ciertos importes, `base + igv ≠ total` por un céntimo, y un comprobante que no cuadra consigo mismo lo rechaza SUNAT. Con el residuo, el `CHECK electronic_documents_amount_breakdown` es cierto por construcción y no por suerte del redondeo (AC26) |
| **D-16**: El envío viaja como **una línea más** del comprobante | Omitirlo, o restarlo del total | El total del documento tiene que ser `amount_total_cents`, que incluye el envío, y SUNAT exige que las líneas sumen el total. Omitirlo daría un comprobante por menos de lo cobrado —una venta subdeclarada— y restarlo del total dejaría dinero cobrado sin comprobante. La línea se añade solo cuando `shipping_cents > 0`, porque un envío gratis no es una línea de importe cero sino una línea que no existe |
| **D-17**: `issued_at` es columna propia y no se deriva de `updated_at` | Filtrar por `updated_at` en #3 y #4 | Lo anticipa el diseño de Ingresos v2 (§4) y el motivo es verificable aquí: `updated_at` lleva `$onUpdate`, así que cualquier escritura futura sobre la fila —un `last_error`, un campo nuevo— movería la fecha con la que el libro de ventas agrupa el período. Un cambio no fiscal no puede mover una venta de mes. Con la emisión manual el punto se agudiza: entre el cobro y la emisión pueden pasar días |
| **D-18**: Los datos fiscales del emisor son variables de entorno validadas al importar | Una tabla `company_settings` con panel de edición | Decisión cerrada con el usuario. Son tres valores que cambian cuando cambia la empresa, es decir, nunca. Una tabla con panel añade CRUD, permiso, auditoría y una pantalla, y crea la posibilidad de que alguien emita cien comprobantes con el RUC mal tecleado. Validarlos al importar, como hace `src/lib/stripe.ts`, convierte un error de configuración en un fallo de arranque en vez de en un rechazo de SUNAT |
| **D-19**: El enlace al PDF se recorta en servidor para quien solo tiene `orders.read` | Publicarlo con el resto de la fila, o dejar que la UI decida si lo pinta | Añadida en la revisión. El PDF de Nubefact es una **URL sin sesión**: quien tenga el enlace lo abre, hoy y dentro de un año. Y el documento que sirve lleva el RUC/DNI y la razón social del comprador —la misma PII que D-13 mantiene fuera de `audit_logs` porque `manager` y `audit` la leen— más el desglose base/IGV que §6.3 reserva a `finance.read`. Los dos roles que tienen `orders.read` sin `invoicing.issue` son exactamente esos dos, así que publicarlo con la fila era la puerta de atrás a lo que el resto del spec protege. El recorte va en `toRow(document, visibility)` y lo deciden los handlers: filtrar en el cliente no filtra nada, porque el enlace ya viajó en la respuesta. No contradice D-12 —la **forma** del tipo sigue siendo una sola— y el comprador sigue viendo el suyo entero, que es el sentido de tener un comprobante |
| **D-20**: El detalle del fallo del proveedor solo se pinta en la vista que puede emitir | Pintarlo siempre, ya que `OrderDocuments` es el mismo componente en las dos superficies (D-12) | Añadida en la revisión. El texto de `last_error` cita el motivo del proveedor —que puede repetir el RUC rechazado— y el copy de al lado dice «corrige el dato antes de volver a emitir»: son instrucciones para quien tiene el botón. En «Mis compras» aparecían encima del «tu comprobante se está emitiendo», dándole al cliente un error que no puede arreglar y contradiciendo el mensaje de debajo. Se condiciona a la presencia de `renderAction`, que es la misma bandera que ya distingue panel de cliente, así que no estrena ni prop ni concepto. Qué pasa con el **badge** de estado lo cierra D-21 |
| **D-21**: El badge rojo de `failed` tampoco se pinta en «Mis compras» | Pintar el badge real en las dos vistas, ocultando solo el diagnóstico (el alcance original de D-20) | Decisión del usuario sobre el punto que la revisión dejó abierto. D-20 quitó el detalle del fallo de la vista del cliente pero dejó el badge «Falló la emisión» justo encima del «tu comprobante se está emitiendo», que es la misma contradicción una línea más abajo. Para el cliente, además, la distinción `pending`/`failed` **no es accionable**: ya pagó, no tiene botón, y el fallo es un asunto entre la tienda, el proveedor y SUNAT. Mientras el documento no esté `issued` ve el mensaje tranquilizador y conserva el recibo de Stripe, que es el respaldo real del cargo (D-14, AC24). La condición es la misma `renderAction` de D-20 —sin prop nueva ni `canIssue` booleano— y el panel no cambia en nada: allí el badge y el botón siguen diciendo la verdad completa a quien puede actuar |
| **D-22**: El catálogo deja de admitir un producto a precio `0` | Mapear la línea de importe cero al código SUNAT de operación gratuita (transferencia a título gratuito) en `toNubefactItems()` | Decisión del usuario sobre el segundo punto abierto de la revisión. Un producto a `priceCents: 0` hoy se emite como línea **gravada al 18 % con valor de venta 0**, que ante SUNAT no es lo que dice ser: una entrega gratuita se declara con otro tipo de afectación y arrastra su propia base imponible de referencia. Las dos salidas eran modelar esa afectación o no producir el caso, y modelarla significa una rama fiscal entera —con su columna en `products`, su test y su mantenimiento— para un catálogo que no regala nada; es además la misma conversación que el producto exonerado, que §10 ya difiere a un spec propio. Se cierra en la entrada, donde cuesta un `.positive()`: mismo invariante y mismo patrón que `expenses.amountCents`. La rama de línea cero **no se retira** de `nubefact.provider.ts`: las líneas salen de `order_items.price_cents_snapshot`, que es histórico, así que un pedido anterior a esta regla sigue teniendo que poder emitirse |

## 9. Tareas

Cada tarea toca una sola capa. El orden es el de dependencia: verificación
externa → catálogo → permisos → esquema → migración → semilla → configuración →
lógica pura → repositorios → servicios → proveedor → handlers → módulo cliente →
UI → documentación.

- [x] **T1** — Contrastar el mapeo de campos de §6.5 y §6.6 con la documentación
      vigente de Nubefact (`operacion`, `tipo_de_comprobante`,
      `cliente_tipo_de_documento`, nombres de los enlaces de respuesta, forma del
      `errors`) y dejar las diferencias anotadas en este spec antes de escribir el
      provider · archivo: `docs/specs/022-facturacion-electronica-emision.md` ·
      verificación: la tabla de §6.5 refleja los nombres reales
- [x] **T2** — Catálogo puro: `ELECTRONIC_DOCUMENT_KINDS`, `DOCUMENT_SERIES_KEYS`,
      `seriesKeyFor(kind, parentKind)`, `formatDocumentLabel(series, number)` y
      las etiquetas de estado · archivo: `src/lib/electronic-documents.ts` ·
      verificación: `npm run typecheck`
- [x] **T3** — Añadir `invoicing.issue` a `PERMISSIONS` (27 → 28) y concederlo
      solo a `super_admin` y `admin`, con el comentario de por qué es recurso
      propio y no `orders.update_status` · archivo: `src/lib/permissions.ts` ·
      verificación: `npm run typecheck && npm test`
- [x] **T4** — Tabla `document_series` con su enum y su `CHECK` (§5.2) · archivo:
      `src/server/db/schema/document-series.ts` · verificación: `npm run typecheck`
- [x] **T5** — Tabla `electronic_documents` con sus dos enums, sus cinco índices y
      sus siete `CHECK` (§5.3) · archivo:
      `src/server/db/schema/electronic-document.ts` · verificación:
      `npm run typecheck`
- [x] **T6** — Cuatro columnas nuevas y cuatro `CHECK` en `orders` (§5.1) ·
      archivo: `src/server/db/schema/order.ts` · verificación: `npm run typecheck`
- [x] **T7** — Exportar las dos tablas y los cuatro enums desde el barrel ·
      archivo: `src/server/db/schema/index.ts` · verificación: `npm run typecheck`
- [x] **T8** — Generar y aplicar la migración `0010` · archivos: `drizzle/` ·
      verificación: `npm run db:generate && npm run db:migrate`, y `npm run db:studio`
      muestra ambas tablas vacías y las cuatro columnas en `orders`
- [x] **T9** — Sembrar las 6 filas de `document_series` leyendo las series de las
      variables de entorno, de forma idempotente y **sin** reiniciar `last_number`
      si la fila ya existe · archivo: `src/server/db/seed.ts` · verificación:
      `npm run db:seed` dos veces seguidas deja 6 filas y el mismo `last_number`
- [x] **T10** — Variables de §5.5 con comentario · archivo: `.env.example` ·
      verificación: lectura
- [x] **T11** — Configuración del emisor y del proveedor con `import 'server-only'`,
      lanzando al importarse si falta alguna · archivo:
      `src/lib/invoicing-config.ts` · verificación: `npm run typecheck`
- [x] **T12** — Validación offline del documento peruano, con sus casos de §6.2 ·
      archivos: `src/modules/orders/lib/peru-document.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T13** — `splitIgv()` con el residuo de §6.4 y sus casos de redondeo ·
      archivos: `src/modules/finance/lib/igv.ts` + `.test.ts` · verificación:
      `npm test`
- [x] **T14** — `buyerSchema`, `buyerFormSchema` y `buyer` dentro de
      `checkoutSchema` (§6.1) · archivos:
      `src/modules/orders/schemas/checkout.schema.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T15** — Tipos del módulo: `ElectronicDocumentRow` —con `permanentFailure`
      y `label`—, `ElectronicDocumentKind` y `ElectronicDocumentStatus` (§6.3) ·
      archivo: `src/modules/invoicing/types/electronic-document.types.ts` ·
      verificación: `npm run typecheck`
- [x] **T16** — Constantes del módulo: etiquetas de `kind` y de `status`,
      `invoicingKeys`, copys del estado vacío, del fallo transitorio y del rechazo
      permanente (§6.7) · archivo: `src/modules/invoicing/constants.ts` ·
      verificación: `npm run typecheck`
- [x] **T17** — Repositorio de series: `nextNumber(tx, key)` con el `UPDATE …
      RETURNING` de §7.1 · archivos:
      `src/server/repositories/document-series.repository.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T18** — Repositorio de documentos: `create`, `claimForIssue`,
      `markIssued`, `markFailed`, `findById`, `findRowsByOrderIds`, con los
      constructores de SQL exportados para probarlos con `PgDialect` · archivos:
      `src/server/repositories/electronic-document.repository.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T19** — Persistir los tres campos del comprador al crear la orden, dentro
      de la transacción que ya existe · archivo:
      `src/server/services/checkout.service.ts` · verificación: `npm test`
- [x] **T20** — Interfaz `InvoicingProvider`, `IssueDocumentInput`,
      `IssueDocumentResult`, `InvoicingProviderError` y `toProviderTrace()`
      (§6.5, §6.6) · archivo: `src/server/services/invoicing/provider.ts` ·
      verificación: `npm run typecheck`
- [x] **T21** — `NubefactProvider`: mapeo del dominio a su payload, línea de envío
      (D-16), clasificación permanente/transitorio y `toProviderTrace()` de la
      respuesta · archivos:
      `src/server/services/invoicing/nubefact.provider.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T22** — `getInvoicingProvider()`: única instancia, resuelta desde la
      configuración · archivo: `src/server/services/invoicing/index.ts` ·
      verificación: `npm run typecheck`
- [x] **T23** — Service de documentos: `queueOriginalDocument` y `issueDocument`
      con las tres transacciones de §7.4, la clasificación de §6.7 y el
      `logAudit` con actor · archivos:
      `src/server/services/electronic-document.service.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T24** — Llamar a `queueOriginalDocument` dentro de la transacción del
      `markPaid`, sin tocar nada más del fulfillment (§7.2) · archivo:
      `src/server/services/order-fulfillment.service.ts` · verificación: `npm test`
- [x] **T25** — Route Handler `POST /api/admin/invoicing/documents/[id]/issue`
      (§7.3) · archivo:
      `src/app/api/admin/invoicing/documents/[id]/issue/route.ts` · verificación:
      `npm run typecheck`
- [x] **T26** — Añadir `data.documents` y `meta.canIssueInvoice` al detalle de
      admin, sin publicar ningún campo de §6.3 excluido · archivo:
      `src/app/api/admin/orders/[id]/route.ts` · verificación: `npm run typecheck`
- [x] **T27** — Añadir `documents` a cada entrada del historial de cliente con una
      sola consulta por página · archivo: `src/app/api/orders/route.ts` ·
      verificación: `npm run typecheck`
- [x] **T28** — Declarar `documents` en `OrderHistoryEntry` y en `AdminOrderDetail`
      · archivo: `src/modules/orders/types/order.types.ts` · verificación:
      `npm run typecheck`
- [x] **T29** — Service axios `issueDocument(id)` · archivo:
      `src/modules/invoicing/services/invoicing.service.ts` · verificación:
      `npm run typecheck`
- [x] **T30** — Hook `useIssueDocument()`: mutation que invalida el detalle del
      pedido y muestra el toast de resultado, distinguiendo el fallo transitorio
      del rechazo permanente · archivo:
      `src/modules/invoicing/hooks/use-issue-document.ts` · verificación:
      `npm run typecheck`
- [x] **T31** — Instalar el componente que falta · comando:
      `npx shadcn@latest add radio-group` · verificación: `npm run lint`
- [x] **T32** — `DocumentStatusBadge`: los cuatro estados con icono y texto, nunca
      solo color · archivo:
      `src/modules/invoicing/components/document-status-badge.tsx` ·
      verificación: `npm run lint`
- [x] **T33** — `OrderDocuments`: lista presentacional de `ElectronicDocumentRow`
      con enlace al PDF (`target="_blank"`, `rel="noopener noreferrer"`), número
      de intentos, estado vacío y prop opcional de acción de emisión · archivo:
      `src/modules/invoicing/components/order-documents.tsx` · verificación:
      `npm run lint`
- [x] **T34** — `BuyerDocumentFields`: `RadioGroup` boleta/factura, campo de
      documento y razón social condicionada, con los mensajes de `buyerFormSchema`
      · archivo: `src/modules/invoicing/components/buyer-document-fields.tsx` ·
      verificación: `npm run lint`
- [x] **T35** — Envolver el resumen del checkout en React Hook Form, montar
      `BuyerDocumentFields` y mapear el cuerpo con `legalName` a `undefined`
      cuando es boleta · archivo:
      `src/modules/orders/components/checkout-summary.tsx` · verificación:
      `npm run lint`
- [x] **T36** — Bloque de documentos y acción «Emitir comprobante» en el sheet de
      detalle, visible solo con `meta.canIssueInvoice`, con el botón deshabilitado
      mientras la mutación está en curso y el aviso del rechazo permanente ·
      archivo: `src/modules/orders/components/admin-order-detail-sheet.tsx` ·
      verificación: `npm run lint`
- [x] **T37** — Comprobante SUNAT en el diálogo del historial, con el recibo de
      Stripe conservado y el copy de «emitiéndose» para `pending`/`failed`
      (AC23, AC24, AC25) · archivo:
      `src/modules/orders/components/order-detail-dialog.tsx` · verificación:
      `npm run lint`
- [~] **T38** — **PARCIAL, bloqueada en la parte que necesita a Nubefact.** Ver
      §12 para el detalle de lo verificado y lo pendiente · Prueba de punta a punta en local contra el entorno de pruebas de
      Nubefact: compra con DNI y compra con RUC comprobando que el documento nace
      `pending` y **nada lo emite solo**; emisión desde el sheet; corte de red a
      mitad de emisión y segunda pulsación comprobando que no nace un comprobante
      duplicado; reenvío del mismo evento de Stripe comprobando que no nace un
      segundo comprobante · verificación: manual, con el registro del resultado en
      este spec
- [x] **T39** — Registrar `electronic_documents` y `document_series` como tablas
      construidas y la facturación electrónica como módulo entregado, dejando
      escrito que **la emisión es manual y no hay ningún proceso programado** ·
      archivo: `docs/SETUP.md` (§5.3 y §6) · verificación: lectura
- [x] **T40** — Cierre: `npm run typecheck && npm run lint && npm run build &&
      npm test` en verde y todos los AC marcados o justificados · verificación:
      los cuatro comandos

## 10. Riesgos y consideraciones

- **Un comprobante puede quedarse sin emitir si nadie mira.** Es la consecuencia
  directa de D-8 y hay que asumirla con los ojos abiertos: la obligación de
  emitir tiene plazos y el sistema ya no los cubre solo. Las tres mitigaciones de
  este spec son que el estado del comprobante se ve en el propio pedido, que la
  acción está a un clic dentro de la pantalla donde el equipo ya trabaja, y que
  el índice `electronic_documents_unissued_idx` deja preparado el indicador
  «pedidos pagados sin comprobante» que construye #3. Si el volumen crece hasta
  hacer inviable el repaso manual, la conversación a tener es la automatización,
  no un parche.
- **La ventana y el mecanismo de la comunicación de baja no se fijan aquí.** El
  documento de diseño (§3) afirma que la baja «solo aplica a boletas, nunca
  facturas». Eso **no coincide** con mi lectura de la normativa vigente, en la que
  la comunicación de baja es el mecanismo de las **facturas** dentro de una
  ventana corta desde la emisión, mientras que las boletas se anulan por el
  resumen diario. No lo resuelvo por mi cuenta y no afecta a este spec —aquí no
  se emite ninguna baja—, pero queda registrado como **punto bloqueante de la
  primera tarea del spec 023**, que es donde importa.
- **Afiliación previa a SUNAT.** La empresa necesita estar afiliada al régimen de
  emisión electrónica con su RUC habilitado y las series dadas de alta en el
  panel de Nubefact. Es un trámite fuera del código y un prerrequisito operativo:
  sin él, todos los documentos serán rechazos permanentes.
- **Costo por comprobante.** Nubefact cobra por documento emitido y las
  correcciones del spec 023 son documentos adicionales. Es una conversación
  comercial, no una decisión de este spec.
- **Catálogo con productos exonerados o inafectos.** `splitIgv()` asume 18%
  general para todo. El día que la tienda venda un producto exonerado, el
  comprobante declararía un IGV que no corresponde. Se documenta como asunción
  explícita (§6.4) y no como comportamiento silencioso; corregirlo exige una
  columna de afectación en `products`, que es un spec propio.
- **Pedidos anteriores a la migración.** Quedan sin documento del comprador para
  siempre y no se emite comprobante por ellos (AC8). No se hace backfill: no se
  puede inventar el DNI de una venta pasada. Si hiciera falta regularizarlos, es
  un proceso manual desde el panel de Nubefact, fuera del código.
- **PII del comprador.** `orders.buyer_document_number` y `buyer_legal_name` son
  datos personales. No salen por ninguna API (AC22), no entran en `audit_logs`
  (D-13) y no se guardan en `provider_response` (AC15). El único sitio donde
  existen es la fila de `orders` y el cuerpo que se envía a Nubefact, que es su
  destino legítimo.
- **El PDF del proveedor es PII servida por una URL sin sesión.** No la emitimos
  nosotros y no caduca por nuestra cuenta: quien tenga el enlace ve el documento
  del comprador, su razón social y el desglose base/IGV. Por eso el enlace solo
  viaja al propio comprador y a quien tiene `invoicing.issue` (D-19), y por eso
  tampoco se guarda en la bitácora. Si algún día hiciera falta enseñarlo a
  `manager` o a `audit`, la conversación es un proxy propio con sesión, no
  ensanchar la proyección.
- **`NUBEFACT_API_TOKEN` es un secreto de servidor.** Vive solo en
  `invoicing-config.ts`, que lleva `import 'server-only'`. En Vercel se marca como
  *sensitive*, igual que `STRIPE_SECRET_KEY`. Ningún `console.error` del provider
  imprime cabeceras.
- **Ninguna ruta nueva sin sesión.** Al no haber cron, la superficie de ataque no
  crece: el único endpoint nuevo exige Clerk + `invoicing.issue`. No hay secreto
  compartido que rotar ni un handler público que alguien pueda martillear.
- **Duración de la petición de emisión.** La llamada a Nubefact ocurre dentro de
  la petición del administrador, así que un proveedor lento se traduce en un
  botón girando. El provider fija un `AbortSignal.timeout` acotado y el fallo sale
  como `502`, nunca como una petición colgada.
- **Correlativos quemados.** Un documento con rechazo permanente conserva su
  serie y su número. La corrección es arreglar el dato y volver a emitir **la
  misma fila**, no crear otra: crear otra dejaría un hueco en la numeración. La
  UI tiene que dejarlo claro.
- **Concurrencia entre dos administradores.** Los dos pasan por `claimForIssue`,
  que reclama con `FOR UPDATE`; el que llega segundo encuentra el documento ya
  `issued` y responde `409`. Y si aun así hubiera dos envíos, el par serie-número
  lo absorbe en el proveedor (D-6).
- **N+1 en el historial.** Los documentos de la página se leen con un solo
  `inArray`, igual que las líneas (spec 008). Con el tope de 60 cabeceras es una
  consulta, no sesenta.
- **Rollback.** Revertir es borrar los archivos nuevos, quitar el `buyer` del
  schema de checkout y retirar la llamada de `queueOriginalDocument`. Las dos
  tablas pueden quedarse. **Si ya se emitió algún comprobante real, la migración
  inversa no debe ejecutarse**: borrar `electronic_documents` destruiría la
  evidencia de documentos que existen ante SUNAT.

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| Notas de crédito, notas de débito, comunicación de baja y reembolso en Stripe | Spec **023**, inmediatamente después de este |
| Emisión en lote («emitir todos los pendientes» desde el listado) | Cuando el repaso documento a documento se vuelva incómodo, es decir, cuando haya más de un puñado de pedidos al día |
| Automatizar la emisión (cron, cola o `waitUntil`) | Solo si el olvido humano se demuestra un problema real en `audit_logs`. La decisión de hoy es explícita (D-8), no un descuido |
| Vista «pedidos pagados sin comprobante» | Sub-proyecto **#3** (Ingresos v2), que ya la contempla; su índice existe desde esta migración |
| Resumen diario de boletas y resumen de anulaciones automatizados | Con 023, si el volumen hace inviable lanzarlos desde el panel de Nubefact |
| Reenvío del comprobante por correo | Cuando exista proveedor de correo. El punto de enganche es `persistSuccess()` |
| Validación en línea de RUC/DNI (RENIEC / padrón SUNAT) | Si aparecen rechazos permanentes recurrentes por documento inexistente |
| Panel de configuración del emisor | Si la empresa cambia de razón social o abre una segunda serie |
| Multi-serie por sucursal o punto de venta | Con la segunda tienda física. `document_series` ya está preparada: es una fila más |
| Publicar `base_cents` / `igv_cents` por API | Sub-proyecto **#4** (Impuestos), bajo `finance.read` |
| Columna de afectación de IGV en `products` | Cuando el catálogo incluya un producto exonerado o inafecto |
| Código SUNAT de operación gratuita para una línea de importe cero | Solo si la tienda decide entregar algo a título gratuito. Hoy el catálogo no lo permite (D-22) y la rama de línea cero existe únicamente para los snapshots históricos de `order_items` |
| Búsqueda de pedidos por documento del comprador | Cuando alguien necesite encontrar la compra de un RUC concreto |
| Almacenar el XML y el CDR en lugar de sus URLs | Si el proveedor deja de servirlos o si SUNAT exige custodia propia |

## 12. Resultado de T38

### Verificado de verdad contra Neon (14/14 en verde)

Ejecutado con un script desechable sobre la base de desarrollo real, creando
pedidos de prueba, llamando a `queueOriginalDocument` dentro de transacciones
reales y borrando después las filas —la base quedó con las 6 series a `0` y
`electronic_documents` vacía—:

| Comprobación | Resultado |
|---|---|
| **AC5** factura con RUC: `pending`, `F001-1` asignado al crear, `created_by_id = null` | PASA |
| **AC26** `base + igv === total` (`187627 + 33773 = 221400`) | PASA |
| **AC6** reentrega del mismo evento: el índice único parcial impide el segundo original, queda **1** fila | PASA |
| **AC16** transacción que revierte: `last_number` vuelve atrás, sin huecos | PASA |
| **AC17** dos asignaciones simultáneas de la misma serie: números distintos y consecutivos (1 y 2) | PASA |
| **AC8** pedido sin documento del comprador: no encola y deja `invoice.skipped` con `severity: warning` | PASA |
| **D-13** `invoice.queued` sin RUC ni razón social en `metadata` | PASA |
| **AC9** el comprobante sigue `pending` con 0 intentos: nada lo emitió solo | PASA |
| `CHECK` rechaza desglose descuadrado, `issued` sin `issued_at`, original con padre, RUC de 8 dígitos, razón social sin RUC y reembolso mayor que el total | PASA (6/6) |

### Bloqueado, y por qué

**No se ejecutó la parte que habla con Nubefact.** Este entorno no tiene salida a
internet ni credenciales del entorno de pruebas de Nubefact
(`NUBEFACT_API_URL`/`NUBEFACT_API_TOKEN` están en `.env.local` con valores
marcados `PENDIENTE-DE-CONFIGURAR`), y tampoco se puede completar un pago real de
Stripe. Queda pendiente, con credenciales de pruebas:

1. Compra real con DNI y con RUC, comprobando el `pending` desde el webhook.
2. Emisión desde el sheet: `issued`, `pdf_url`/`xml_url`/`cdr_url`,
   `attempt_count = 1` y `invoice.issued` en la bitácora (AC10).
3. **Corte de red a mitad de emisión y segunda pulsación** — el punto abierto de
   §7.2.1: confirmar qué devuelve Nubefact al reenviar un par serie-número que ya
   emitió. Si devuelve un `errors` de duplicado en vez del documento, hay que
   añadir esa rama a `isPermanentFailure()`.
4. Rechazo permanente (RUC inválido a propósito) comprobando `permanentFailure`
   en la UI (AC12).

Los AC que dependen de esa conversación —**AC10, AC11, AC12, AC13 y AC15 en su
mitad de «respuesta real del proveedor»**— quedan **sin verificar en ejecución**,
aunque sí cubiertos por los tests unitarios de `nubefact.provider.test.ts` y
`provider.test.ts` sobre respuestas de Nubefact reproducidas a mano.
