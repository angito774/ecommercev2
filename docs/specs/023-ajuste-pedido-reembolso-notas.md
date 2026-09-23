---
id: 023
title: Ajustar pedido — reembolso en Stripe con nota de crédito, nota de débito y comunicación de baja
status: done
module: invoicing
scope: admin
created: 2026-09-22
---

# 023 — Ajustar pedido: reembolso en Stripe y documentos de corrección SUNAT

> Segunda mitad del sub-proyecto **#0** del roadmap de Finanzas. Continúa y
> **depende por completo** de [022](./022-facturacion-electronica-emision.md),
> que crea el esquema entero —incluidas las columnas y los valores de enum que
> solo se usan aquí—, la interfaz `InvoicingProvider` y la **única puerta de
> emisión**, que es manual.
> Diseño previo: [facturación electrónica](../superpowers/specs/2026-09-21-facturacion-electronica-design.md) §3 y §4.

## 1. Contexto

Tras el spec 022 la tienda emite boletas y facturas desde `/admin/orders`, pero
**no tiene ningún camino que devuelva dinero ni que corrija un comprobante ya
enviado a SUNAT**. Verificado:

- `order_status` solo tiene `canceled` para sesiones de Stripe que expiraron
  **antes** de pagar (spec 007, D-7). Ningún camino lleva de `paid` a otro sitio.
- `docs/specs/014-admin-orders.md` §3 excluye explícitamente «reembolsos,
  anulaciones o cualquier llamada a la API de Stripe»: la única mutación del
  panel es `PATCH /api/admin/orders/[id]` con `{ status: 'canceled' }`, y solo
  desde `pending`.
- `src/lib/stripe.ts` expone el cliente completo, así que `stripe.refunds.create`
  está disponible sin instalar nada.
- `orders.refunded_amount_cents` existe desde la migración `0010` con
  `CHECK (>= 0 AND <= amount_total_cents)` y **nadie la escribe todavía**.
- `electronic_documents` admite ya `nota_credito`, `nota_debito`,
  `comunicacion_baja`, `voided`, `related_document_id`, `reason_code` y
  `stripe_refund_id`, y su índice único de original vigente excluye `voided`
  precisamente para permitir la reemisión de este spec.

Hoy, devolver dinero se hace a mano en el Dashboard de Stripe y el comprobante
emitido se queda diciendo que la venta ocurrió por su importe completo. Es una
divergencia entre lo cobrado y lo declarado que, sin este spec, crece en cada
devolución.

**Sin ningún proceso en segundo plano**, igual que 022: el ajuste registra el
hecho y deja el documento de corrección en cola; emitirlo es la misma acción
manual «Emitir comprobante» que ya existe (D-13).

## 2. Objetivo

Una persona con `orders.refund` puede anular un pedido pagado, devolver una parte
de su importe o corregir los datos fiscales del comprador, y en un solo flujo el
dinero vuelve por Stripe y el documento SUNAT correspondiente —nota de crédito,
nota de débito o comunicación de baja— queda listo para emitirse con su motivo
del catálogo oficial.

## 3. Alcance

### Incluye

- Permiso nuevo `orders.refund` (catálogo 28 → 29), solo `super_admin` y `admin`.
- `POST /api/admin/orders/[id]/adjust` con cuatro intenciones (§6.1), resueltas a
  un mecanismo SUNAT **en el servidor**, nunca en la UI.
- Reembolso en Stripe (total o parcial) con clave de idempotencia derivada del
  estado, de modo que reintentar la acción nunca devuelve el dinero dos veces.
- Escritura atómica de `orders.refunded_amount_cents` y del documento de
  corrección `pending`, con su `audit_logs` en la misma transacción.
- Emisión del documento de corrección con **la misma acción manual del spec 022**
  (`POST /api/admin/invoicing/documents/[id]/issue`), sin ningún camino nuevo de
  emisión (D-13).
- Transición del original a `voided` cuando el documento que lo anula queda
  `issued`, y **reencolado automático** del comprobante corregido cuando el
  pedido sigue cobrado.
- Extensión de `NubefactProvider` a los tres `kind` de corrección. **La interfaz
  `InvoicingProvider` no cambia**: es la comprobación de que D-1 de 022 sirvió
  para algo.
- Catálogos de motivo 09 (nota de crédito) y 10 (nota de débito) como módulo
  puro, con el subconjunto admitido por cada intención.
- Diálogo «Ajustar pedido» en el `Sheet` de `/admin/orders`, con resumen
  explícito de lo que va a pasar antes de confirmar y aviso de que el documento
  queda pendiente de emisión.
- El monto reembolsado acumulado, visible en el detalle del pedido.

### No incluye (explícito)

- **Cualquier proceso en segundo plano.** El documento de corrección no se emite
  solo, igual que el original (022, D-8). §10 recoge el riesgo que eso añade
  aquí, que es mayor que en 022 porque el dinero ya salió.
- **Un camino de emisión propio para las correcciones.** Se reutiliza el del
  spec 022 sin tocarlo (D-13).
- **Reingreso de stock.** Devolver dinero no repone mercadería: la devolución
  física se registra como nota de ingreso `ingreso_devolucion` (spec 020), que ya
  existe y es un proceso separado del fiscal. Este spec no toca `products.stock`
  ni `stock_movements`.
- **Cobro adicional automático.** La nota de débito **documenta** un mayor
  importe; no crea ningún `PaymentIntent` ni cobra nada al cliente (D-8).
- **Cambios en `order_status`.** El enum no crece. El estado de reembolso se
  deriva de `refunded_amount_cents` frente a `amount_total_cents`.
- **Reembolso por ítem con recálculo de líneas.** El ajuste es sobre un **monto**
  del pedido, no sobre líneas concretas.
- **Cambios de esquema.** §5.
- **Reembolso iniciado por el cliente.** No hay «solicitar devolución» en la
  tienda: el flujo lo dispara siempre un administrador.
- **Resumen de anulaciones (boletas) automatizado.** Si la regla confirmada en T1
  exige resumen diario en lugar de baja individual, se lanza desde el panel de
  Nubefact.
- **Corrección de importes, líneas o dirección del pedido.** La única corrección
  sin dinero que se construye es la de los datos fiscales del comprador.
- **Reversión de un ajuste.** Un ajuste emitido no se deshace desde la
  aplicación; lo que lo corrige es otro documento.

## 4. Criterios de aceptación

- [x] **AC1** — Dado un usuario sin sesión, cuando llama a
      `POST /api/admin/orders/[id]/adjust`, entonces `401` con `{ message }` y
      nunca un `307` a HTML.
- [x] **AC2** — Dado un usuario con `orders.read` y `orders.update_status` pero
      sin `orders.refund`, entonces la respuesta es `403` aunque el cuerpo sea
      inválido: la autorización ocurre antes de leerlo.
- [x] **AC3** — Dado un rol `manager` o `audit`, entonces
      `meta.canRefund` es `false`, el sheet no pinta «Ajustar pedido» y un `POST`
      directo responde `403`.
- [x] **AC4** — Dado un pedido que no está `paid`, entonces la respuesta es `409`
      nombrando su estado actual y no se llama a Stripe.
- [x] **AC5** — Dado un pedido `paid` cuyo comprobante original **no** está
      `issued`, entonces la respuesta es `409`: no se puede acreditar un
      documento que SUNAT todavía no tiene. El mensaje dirige a emitir primero el
      original, que es una acción disponible en la misma pantalla.
- [x] **AC6** — Dada una `devolucion_parcial` por un importe mayor que
      `amount_total_cents − refunded_amount_cents`, entonces `400` con el saldo
      disponible en el mensaje y sin ninguna llamada a Stripe.
- [x] **AC7** — Dada una `devolucion_parcial` válida, entonces se crea un refund
      en Stripe por ese importe exacto, `refunded_amount_cents` crece en ese
      importe, nace una fila `nota_credito` `pending` con
      `related_document_id` = el original y `stripe_refund_id` relleno, y todo
      ello en **una sola transacción** con su `order.refunded` en `audit_logs`.
- [ ] **AC8** — Dada la **misma** petición enviada dos veces sin que la primera
      llegara a confirmar en base, entonces Stripe crea **un solo** refund: la
      clave de idempotencia se deriva del estado del pedido y no de un valor
      aleatorio (D-4).
- [ ] **AC9** — Dados dos administradores que disparan un ajuste a la vez sobre el
      mismo pedido, entonces uno obtiene `200` y el otro `409`, y el importe
      devuelto en Stripe es el de **un** ajuste, no el de dos.
- [ ] **AC10** — Dado que la transacción de base falla después de que Stripe
      confirmó el refund, entonces la respuesta es `500`, `refunded_amount_cents`
      no cambia y **reintentar la misma acción** reutiliza el refund existente en
      vez de devolver el dinero otra vez.
- [x] **AC11** — Dado un método de pago que Stripe no permite reembolsar por API,
      entonces la respuesta es `502` con un mensaje que explica que el reembolso
      lo rechazó el proveedor, y ni `refunded_amount_cents` ni
      `electronic_documents` cambian.
- [x] **AC12** — Dada una `anulacion_total`, entonces se reembolsa exactamente el
      saldo no reembolsado, `refunded_amount_cents` queda igual a
      `amount_total_cents` y el mecanismo elegido por el servidor es el de §6.2,
      nunca uno que venga en el cuerpo.
- [x] **AC13** — Dado un `reasonCode` que no pertenece al subconjunto de la
      intención elegida, entonces `400`: el catálogo se valida contra la
      intención, no solo contra la lista completa.
- [ ] **AC14** — Dado que una `comunicacion_baja`, o una `nota_credito` de
      anulación total, pasa a `issued`, entonces su documento padre pasa a
      `voided` **en la misma transacción**.
- [ ] **AC15** — Dada una `correccion_comprador`, entonces se actualizan los tres
      campos fiscales de `orders`, nace el documento que anula el original y,
      cuando ese documento queda `issued`, se encola **automáticamente** un
      comprobante original nuevo con los datos corregidos y su propio correlativo
      —en estado `pending`, pendiente de emisión como cualquier otro—.
- [x] **AC16** — Dada una `correccion_comprador` sobre un pedido con
      `refunded_amount_cents > 0`, entonces `409`: corregir datos y devolver
      dinero son dos historias que no se mezclan en una sola fila.
- [ ] **AC17** — Dada una `anulacion_total`, entonces **no** se reencola ningún
      comprobante: el pedido quedó íntegramente devuelto.
- [x] **AC18** — Dado un `cargo_adicional`, entonces nace una `nota_debito`
      `pending`, `refunded_amount_cents` **no** cambia y no se crea ningún cobro
      en Stripe.
- [x] **AC19** — Dado cualquier ajuste, entonces `audit_logs` registra el pedido,
      la intención, el mecanismo, el motivo y el importe del ajuste, y **nunca**
      el documento del comprador ni el `client_secret` ni ningún objeto crudo de
      Stripe.
- [x] **AC20** — Dado cualquier ajuste, entonces el stock de los productos del
      pedido **no** cambia y no aparece ninguna fila en `stock_movements`.
- [x] **AC21** — Dado el detalle de un pedido en `/admin/orders`, entonces se ve
      el árbol de documentos —original y correcciones, cada una bajo el documento
      que modifica—, el importe reembolsado acumulado y el saldo disponible.
- [x] **AC22** — Dado un ajuste recién confirmado, entonces el sheet se actualiza
      sin recargar la página, el diálogo se cierra y el documento nuevo aparece
      `pending` **con su acción «Emitir comprobante» disponible**; ante un `409`
      o un `502`, el diálogo permanece abierto con el mensaje del servidor.
- [x] **AC23** — Dado un ajuste confirmado, entonces el documento de corrección
      sigue `pending` mientras nadie lo emita: **no existe ningún camino de
      emisión propio de este spec** ni ningún proceso que lo dispare, y la UI lo
      advierte porque el dinero ya salió de Stripe.
- [x] **AC24** — Dado cualquier importe de la API de este spec, entonces es un
      entero en céntimos; la división por 100 solo ocurre al formatear.
- [x] **AC25** — Dado `npm run typecheck && npm run lint && npm run build &&
      npm test`, entonces los cuatro pasan en verde.

> **Los seis sin marcar —AC8, AC9, AC10, AC14, AC15 y AC17— esperan a T21**, que no
> se ejecutó (ver §9). No es que estén sin construir: los seis están implementados y
> su parte pura tiene test —la clave de idempotencia derivada del estado, el
> `WHERE` optimista del `UPDATE`, `voidsParent()` y la comparación
> `refunded < total` que decide el reencolado—. Lo que falta es la única
> comprobación que ningún test unitario puede dar: que **Stripe** devuelve el mismo
> refund ante la misma clave, y que la secuencia `markIssued` → `markVoided` →
> `queueOriginalDocument` cabe de verdad en una transacción contra Postgres sin
> violar el índice único de original vigente. Justo ahí estaba el defecto que
> obligó a la migración `0011` (§5.0), así que declararlos verificados por lectura
> sería exactamente el error que ese defecto ya demostró posible.
>
> **Tras la revisión, los dos caminos que la lectura no había cubierto sí tienen
> test**, porque eran los dos donde el defecto no era «falta verificar» sino
> «estaba mal»: dos ajustes concurrentes con **importes distintos** desde el mismo
> estado (AC9, `order-adjustment.service.test.ts`, la clave ya no lleva el importe
> dentro — §6.4) y dos correcciones seguidas sobre el **mismo original ya anulado**
> (AC14, `electronic-document.service.void.test.ts`, `markVoided()` devolviendo
> `null` corta el reencolado en vez de reventar el índice único). T21 sigue abierta
> para lo que solo el proveedor real puede decir.

## 5. Modelo de datos

**Sin cambios de esquema.** No hay tabla nueva, ni columna nueva, ni valor de
enum nuevo, ni migración: el spec 022 creó en la migración `0010` todo lo que
este spec escribe, precisamente para que el sub-proyecto no dejara dos
migraciones sobre la misma tabla (022 §0).

Lo que este spec **estrena** de ese esquema ya existente:

| Elemento | Tabla | Lo escribe |
|---|---|---|
| `refunded_amount_cents` | `orders` | El service de ajuste, con `UPDATE` condicional |
| `buyer_document_type` / `_number` / `buyer_legal_name` (actualización) | `orders` | Solo la intención `correccion_comprador` |
| `kind` = `nota_credito` \| `nota_debito` \| `comunicacion_baja` | `electronic_documents` | El service de ajuste |
| `related_document_id` | `electronic_documents` | Idem: apunta siempre al documento que se modifica |
| `reason_code` | `electronic_documents` | Idem: motivo del catálogo 09 o 10 |
| `stripe_refund_id` | `electronic_documents` | Idem, solo cuando hubo dinero |
| `status` = `voided` | `electronic_documents` | `persistSuccess()`, sobre el documento **padre** |
| Claves `nota_credito_*` y `nota_debito_*` de `document_series` | `document_series` | El correlativo del documento de corrección |

Única salvedad verificada: el índice
`electronic_documents_one_original_per_order_idx` es parcial con
`status <> 'voided'`, así que la reemisión de AC15 no lo viola. Si al implementar
se descubriera que la migración `0010` no incluyó esa cláusula, **es un defecto
de 022 y se corrige allí**, no con una migración nueva aquí.

### 5.0 Corrección al implementar: el `CHECK` que impedía anular (migración `0011`)

**Este spec sí lleva una migración, y es una corrección de un defecto de 022, no
una necesidad propia.** Se declara aquí en lugar de esconderla, porque contradice
la primera línea de esta sección.

Comprobado en la base antes de asumir nada:
`orders.refunded_amount_cents` **existe** (`integer NOT NULL DEFAULT 0`, con su
`CHECK (>= 0 AND <= amount_total_cents)`), y las seis claves de `document_series`
sirven tal cual. Nada de eso necesita esquema nuevo, como decía §5.

Lo que sí lo necesitaba es el `CHECK electronic_documents_issued_at_matches_status`
que creó la migración `0010`:

```sql
CHECK ((status = 'issued') = (issued_at is not null))
```

El original que se anula es, por definición, un documento `issued`, así que lleva
`issued_at` relleno. `markVoided()` hace `UPDATE … SET status = 'voided'`, y la
fila queda con `status = 'voided'` e `issued_at IS NOT NULL`: lado izquierdo
`false`, lado derecho `true`, **violación del constraint**. Es decir, AC14 y AC15
eran inalcanzables tal como estaba el esquema. Nadie pudo verlo en 022 porque
ninguno de sus caminos escribe `voided`, y los tests unitarios no lo alcanzan: el
`CHECK` solo dispara contra Postgres real.

Las dos salidas, y por qué se eligió la segunda:

1. **Poner `issued_at = null` al anular.** Pasa el `CHECK` sin migración y respeta
   la letra de §5, pero **destruye la fecha en la que ese comprobante se emitió
   ante SUNAT**. Un documento anulado sí se emitió, y esa fecha es la que #3 usa
   para agrupar el libro de ventas por período (022, D-17). Es dato fiscal borrado
   para contentar a un constraint mal escrito.
2. **Corregir el `CHECK`**, que es lo que el párrafo de arriba contempla para el
   índice parcial: «es un defecto de 022 y se corrige allí».

`drizzle/0011_icy_maggott.sql`, de dos sentencias:

```sql
ALTER TABLE "electronic_documents" DROP CONSTRAINT "electronic_documents_issued_at_matches_status";
ALTER TABLE "electronic_documents" ADD CONSTRAINT "electronic_documents_issued_at_matches_status"
  CHECK (("status" in ('issued', 'voided')) = ("issued_at" is not null));
```

La equivalencia sigue siendo exacta porque `markVoided()` lleva
`WHERE status = 'issued'` en su propio `WHERE`: un `pending` o un `failed` nunca
alcanzan `voided`, así que un `voided` siempre conserva su `issued_at`. Aplicada y
verificada contra Neon:

```
CHECK (((status = ANY (ARRAY['issued', 'voided'])) = (issued_at IS NOT NULL)))
```

**Ninguna tabla nueva, ninguna columna nueva, ningún valor de enum nuevo.** El
resto de §5 se mantiene tal cual.

### 5.1 Catálogo de permisos

`npm run db:seed`, idempotente. El catálogo pasa de **28 a 29** códigos.

**Ejecutado y verificado contra Neon** (lo había quedado pendiente y la revisión lo
encontró: el código estaba en `permissions.ts` y la base seguía en 28, así que
`orders.refund` no existía y **ni `super_admin` lo tenía**). Salida del seed:
«Permisos: 29 sincronizados sobre 29 · Matriz rol × permiso: 2 asignaciones nuevas
sobre 80». Comprobado después con una consulta directa: `count(*) = 29` en
`permissions` y `orders.refund` presente en `role_permissions` **solo** para
Super administrador y Administrador, que es la matriz de abajo.

```ts
// src/lib/permissions.ts — una entrada nueva en PERMISSIONS
{
  code: 'orders.refund',
  resource: 'orders',
  action: 'refund',
  description: 'Anular o devolver el importe de un pedido pagado y registrar su documento de corrección.',
},
```

| Rol | `orders.read` | `orders.update_status` | `invoicing.issue` | `orders.refund` |
|---|---|---|---|---|
| `super_admin` | sí | sí | sí | **sí** |
| `admin` | sí | sí | sí | **sí** |
| `manager` | sí | sí | no | **no** |
| `audit` | sí | no | no | **no** |

`manager` tiene `orders.update_status` y **no** recibe este permiso, y la
diferencia es la que justifica un código aparte: cancelar un pedido `pending`
no mueve un céntimo —nunca se cobró— mientras que esto devuelve dinero real y
prepara un documento fiscal a nombre de la empresa. Mismo criterio restrictivo
que el resto de finanzas (spec 017, D-3) y que `pricing.set_initial_cost`
(spec 021, D-6).

Los dos permisos de facturación se conceden a los mismos dos roles, y es
deliberado: quien puede decidir una devolución es quien después tiene que emitir
su nota de crédito, y separarlos crearía el estado «alguien devolvió dinero y
nadie puede documentarlo» (§10).

## 6. Contratos de API

| Método | Ruta | Auth | Request | Response | Errores |
|---|---|---|---|---|---|
| POST | `/api/admin/orders/[id]/adjust` | `orders.refund` | `OrderAdjustmentInput` | `OrderAdjustmentResult` (200) | 400, 401, 403, 404, 409, 502, 500 |
| GET | `/api/admin/orders/[id]` | `orders.read` | **modificado** | gana `data.refundedAmountCents` y `meta.canRefund` | 400, 401, 403, 404, 500 |

Ningún endpoint de emisión: el documento de corrección se emite con
`POST /api/admin/invoicing/documents/[id]/issue` del spec 022, sin un solo
cambio en ese handler (D-13).

`POST` y no `PATCH`: no se edita un campo del pedido, se **registra un hecho**
—una devolución con su documento— y la operación no es idempotente por
repetición. `200` y no `201`: el recurso creado no es direccionable por sí mismo;
lo que devuelve la respuesta es el pedido con su árbol de documentos.

### 6.1 Entrada

```ts
// src/modules/invoicing/schemas/order-adjustment.schema.ts
import { buyerSchema } from '@/modules/orders/schemas/checkout.schema';

// Unión discriminada y no un objeto con todo opcional: con campos opcionales, un
// `cargo_adicional` que viaje con `buyer` compilaría y el service tendría que decidir
// qué ignorar. Aquí, cada intención declara **exactamente** lo que admite, y lo que
// sobra es un 400 de Zod sin escribir un solo `if` (D-2).
export const orderAdjustmentSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('anulacion_total'),
    // Sin `amountCents`: el importe de una anulación total es, por definición, el saldo
    // no reembolsado. Aceptarlo del cliente permitiría «anular totalmente» por menos
    // del total, que es otra operación con otro nombre.
    reasonCode: z.enum(REASONS_BY_INTENT.anulacion_total),
  }),
  z.object({
    intent: z.literal('devolucion_parcial'),
    amountCents: z
      .number()
      .int('El importe debe expresarse en céntimos enteros')
      .positive('El importe debe ser mayor que cero')
      .max(MAX_PRICE_CENTS, 'El importe supera el máximo admitido'),
    reasonCode: z.enum(REASONS_BY_INTENT.devolucion_parcial),
  }),
  z.object({
    intent: z.literal('correccion_comprador'),
    // El mismo `buyerSchema` del checkout (spec 022, §6.1): la validación de DNI/RUC y
    // la regla de la razón social existen una sola vez en todo el repo.
    buyer: buyerSchema,
    reasonCode: z.enum(REASONS_BY_INTENT.correccion_comprador),
  }),
  z.object({
    intent: z.literal('cargo_adicional'),
    amountCents: z.number().int().positive().max(MAX_PRICE_CENTS),
    reasonCode: z.enum(REASONS_BY_INTENT.cargo_adicional),
  }),
]);

export type OrderAdjustmentInput = z.output<typeof orderAdjustmentSchema>;
```

El importe **no** se valida contra el saldo en Zod: el saldo depende de otra fila
y de un estado que puede cambiar entre la validación y la escritura. Es un
`ValidationError` del service, que `toErrorResponse()` traduce a `400` sin
`issues` — el mismo criterio que la fecha de pago de nómina (spec 018, D-16).

### 6.2 Resolución del mecanismo (normativa, pura y con test)

```ts
// src/lib/electronic-documents.ts — añadidos al catálogo puro del spec 022

/** Catálogo 09 de SUNAT, el subconjunto que este negocio puede usar. */
export const CREDIT_NOTE_REASONS = [
  { code: '01', label: 'Anulación de la operación' },
  { code: '02', label: 'Anulación por error en el RUC' },
  { code: '03', label: 'Corrección por error en la descripción' },
  { code: '04', label: 'Descuento global' },
  { code: '06', label: 'Devolución total' },
  { code: '07', label: 'Devolución por ítem' },
  { code: '09', label: 'Disminución en el valor' },
] as const;

/** Catálogo 10 de SUNAT. */
export const DEBIT_NOTE_REASONS = [
  { code: '01', label: 'Intereses por mora' },
  { code: '02', label: 'Aumento en el valor' },
  { code: '03', label: 'Penalidades u otros conceptos' },
] as const;

/**
 * Qué motivos admite cada intención. Es una tabla y no un `switch` porque la consume
 * dos veces: Zod la usa para construir el `enum` de cada rama (§6.1) y el diálogo para
 * pintar el `Select`, así que una sola fuente evita que la UI ofrezca un motivo que el
 * servidor rechaza (AC13).
 */
export const REASONS_BY_INTENT = {
  anulacion_total: ['01', '06'],
  devolucion_parcial: ['04', '07', '09'],
  correccion_comprador: ['02', '03'],
  cargo_adicional: ['01', '02', '03'],
} as const;
```

```ts
// src/modules/invoicing/lib/adjustment.ts — nuevo, módulo puro
export type AdjustmentPlan = {
  /** El documento que se va a crear. */
  kind: Exclude<ElectronicDocumentKind, 'boleta' | 'factura'>;
  reasonCode: string;
  /** Importe del documento. `null` solo en `comunicacion_baja`. */
  amountCents: number | null;
  /** Lo que hay que devolver por Stripe. `0` = el ajuste no mueve dinero. */
  refundCents: number;
  /** El original queda `voided` cuando este documento se emita. */
  voidsParent: boolean;
};

/**
 * Única función que decide qué documento SUNAT corresponde. Vive en servidor y es pura,
 * así que la UI **no** elige el mecanismo: elige la intención y ve el plan que el
 * servidor calculó. Que la UI pudiera proponer «emite una comunicación de baja» sería
 * dejar una decisión fiscal en manos de un `<Select>`.
 */
export function planAdjustment(args: {
  input: OrderAdjustmentInput;
  original: { kind: 'boleta' | 'factura'; amountCents: number; issuedAt: Date };
  amountTotalCents: number;
  refundedAmountCents: number;
  now: Date;
}): AdjustmentPlan;
```

Reglas que el test fija:

1. `anulacion_total` → `refundCents = amountTotalCents − refundedAmountCents`.
   El mecanismo es **`comunicacion_baja`** cuando `canVoidWithCommunication()`
   dice que sí, y **`nota_credito`** en cualquier otro caso. `voidsParent = true`
   en ambos.
2. `devolucion_parcial` → `nota_credito` por `amountCents`,
   `refundCents = amountCents`, `voidsParent = false`.
3. `correccion_comprador` → mismo mecanismo que 1 (baja o nota de crédito por el
   importe íntegro del original), `refundCents = 0`, `voidsParent = true`.
4. `cargo_adicional` → `nota_debito` por `amountCents`, `refundCents = 0`,
   `voidsParent = false`.
5. `comunicacion_baja` siempre lleva `amountCents: null` (lo exige el `CHECK`
   `electronic_documents_void_has_no_amount`).

```ts
// src/modules/invoicing/lib/adjustment.ts
/**
 * **El contenido de esta función se fija en T1**, contrastando la normativa vigente y
 * la documentación de Nubefact. El documento de diseño afirma que la comunicación de
 * baja «solo aplica a boletas, nunca facturas», y eso contradice mi lectura de la
 * norma —la baja es el mecanismo de la **factura** dentro de una ventana corta desde
 * la emisión, mientras que las boletas se anulan por el resumen diario—. No se
 * resuelve por deducción: se confirma y se escribe aquí.
 *
 * La función existe aisladamente **por eso**: sea cual sea la regla, cambiarla es
 * editar un archivo puro con su test, y todo lo demás —el service, el provider, el
 * diálogo— sigue igual. Valor por defecto mientras no se confirme: `false`, es decir,
 * **siempre nota de crédito**. Es el mecanismo general, cubre todos los casos y nunca
 * es inválido; elegir baja por error sí lo sería.
 *
 * Con la emisión manual (022, D-8) el plazo de la ventana se cuenta desde la emisión
 * del original, **no** desde el cobro: entre uno y otro puede haber días, y usar la
 * fecha del pedido dejaría fuera de plazo documentos que sí lo están. Por eso el
 * argumento es `original.issuedAt` y no `order.createdAt`.
 */
export function canVoidWithCommunication(
  original: { kind: 'boleta' | 'factura'; issuedAt: Date },
  now: Date,
): boolean;
```

### 6.3 Salida

```ts
// src/modules/invoicing/types/order-adjustment.types.ts
export type OrderAdjustmentResult = {
  orderId: string;
  refundedAmountCents: number;
  /** Saldo aún devolvible: `amountTotalCents − refundedAmountCents`. */
  refundableCents: number;
  /** Árbol completo tras el ajuste, con la misma fila que publica el spec 022. */
  documents: ElectronicDocumentRow[];
};
```

`stripe_refund_id` **no sale por la API**, igual que `provider_response`: es una
referencia interna del proveedor de pago y el panel ya muestra los ids de Stripe
del pedido bajo `orders.read` (spec 014, D-6). Publicarlo por segunda vez en otra
proyección solo añade un sitio donde revisar qué se expone.

`ElectronicDocumentRow` gana dos campos, y son los únicos cambios en el contrato
del spec 022:

```ts
  /** `null` en el original. La UI construye el árbol con esto, sin adivinar por fecha. */
  relatedDocumentId: string | null;
  /** Etiqueta del motivo, ya resuelta contra el catálogo: la UI no reimplementa el mapa. */
  reasonLabel: string | null;
```

### 6.4 Orden de operaciones (normativo)

Es la parte delicada del spec: hay una llamada de red que mueve dinero real y una
escritura en base que tiene que cuadrar con ella. El orden es **leer, cobrar,
escribir**, y lo que lo hace seguro es la clave de idempotencia:

```
tx A — lectura bajo lock
  select … from orders where id = $1 for update
  · valida estado `paid`, original `issued`, saldo suficiente, precondiciones
  · guarda `refundedBefore = orders.refunded_amount_cents`
  · planAdjustment()  → el plan
  COMMIT   ← el lock se suelta ANTES de la llamada de red (spec 022, D-9)

(sin transacción)  solo si plan.refundCents > 0
  stripe.refunds.create(
    { payment_intent, amount: plan.refundCents },
    { idempotencyKey: `refund:${orderId}:${refundedBefore}` },   ← sin el importe dentro
  )

tx B — escritura
  update orders
     set refunded_amount_cents = refunded_amount_cents + $refund
   where id = $1 and refunded_amount_cents = $refundedBefore   ← 0 filas = alguien se adelantó
  · si 0 filas → ConflictError (409). El perdedor no creó ningún refund propio: con la
    clave compartida Stripe le devolvió el del ganador, o le rechazó la petición por
    reuso de clave con parámetros distintos (AC9)
  · documentSeriesRepository.nextNumber(tx, seriesKeyFor(plan.kind, original.kind))
  · electronicDocumentRepository.create(tx, { …plan, relatedDocumentId: original.id,
      stripeRefundId, status: 'pending', createdById: actor.id })
  · si intent === 'correccion_comprador' → orderRepository.updateBuyer(tx, …)
  · logAudit(tx, 'order.refunded' | 'order.adjusted')
  COMMIT

(después, cuando una persona lo decida)
  POST /api/admin/invoicing/documents/[id]/issue    ← el handler del spec 022, intacto
```

**Por qué la clave de idempotencia se deriva del estado y no de un uuid nuevo**
(D-4): incluye `refundedBefore`, así que dos intentos de *la misma* operación
—porque la `tx B` falló, o porque dos administradores pulsaron a la vez— producen
la **misma** clave y Stripe devuelve el refund ya creado en lugar de uno nuevo. Y
un ajuste posterior *legítimo* parte de un `refundedBefore` distinto, así que su
clave también lo es y no se bloquea. Un uuid generado en el cliente no daría la
segunda propiedad sin persistirlo, y persistirlo exigiría una columna que este
spec se comprometió a no añadir.

**Y por qué el importe del refund NO entra en la clave.** Corrección tras la
revisión: la primera versión usaba
`refund:${orderId}:${refundedBefore}:${plan.refundCents}` y eso era una fuga de
dinero. Dos administradores que leen el mismo `refundedBefore = 0` y piden
importes distintos —100 y 200— producen claves **distintas**, así que Stripe crea
**dos** refunds reales. Gana la `tx B` del primero, el segundo sale por `409` y su
`stripeRefundId` se descarta en silencio: dinero fuera, sin fila, sin bitácora y
sin rastro.

Sin el importe, los dos comparten clave y Stripe resuelve el caso en el único
sitio donde puede resolverse —el suyo—: si los parámetros coinciden devuelve el
mismo refund, y si no coinciden **rechaza** el segundo por reuso de clave. El
perdedor recibe un error explícito en vez de mover dinero que nadie registra, que
es exactamente el intercambio que hay que querer.

El precio es acotado y deliberado: dos ajustes legítimos por importes distintos
desde el mismo estado no pueden ocurrir a la vez —solo uno gana la `tx B`— y el
segundo, una vez confirmado el primero, parte de un `refundedBefore` distinto y
tiene su propia clave.

**Y el hueco complementario, el refund huérfano.** Si la `tx B` falla después de
que Stripe confirmó el reembolso, la referencia `re_…` no llega a ninguna fila.
No hay forma de arreglarlo dentro de la petición —el dinero ya salió y el destino
donde anotarlo es justo lo que falló—, así que `adjustOrder()` envuelve el
`persist()` y escribe `console.error('adjustOrder.orphanRefund', orderId,
stripeRefundId, refundCents)` antes de relanzar el error tal cual. No cambia lo
que ve el administrador; deja el rastro mínimo para conciliarlo a mano en el
Dashboard de Stripe, que es lo único que esta arquitectura puede ofrecer sin la
columna de referencia que §5 se comprometió a no añadir.

### 6.5 Anulación del padre y reencolado

Ocurre cuando el documento de corrección se emite, es decir, cuando alguien pulsa
«Emitir comprobante»; no hay ningún otro disparador.

```ts
// src/server/services/electronic-document.service.ts — dentro de persistSuccess()
  const issued = await electronicDocumentRepository.markIssued(tx, document.id, values);
  if (!issued) return;

  if (!voidsParent(issued)) return;      // puro: baja, o nota de crédito con motivo 01/02

  // `null` = el padre ya estaba `voided` por una corrección anterior. Es «ya está hecho» y
  // se corta aquí: seguir de largo encolaría un segundo original sobre un pedido que ya
  // tiene el reemitido vigente, violando el índice único parcial con un 500 genérico
  // **después** de que el proveedor emitió este documento —que quedaría `pending` para
  // siempre repitiendo el mismo error—. El JSDoc de `markVoided()` ya lo documentaba.
  const voided = await electronicDocumentRepository.markVoided(tx, issued.relatedDocumentId);
  if (!voided) return;

  // El pedido sigue cobrado ⇒ sigue necesitando comprobante. Esta comparación es lo que
  // distingue una anulación total —donde `refunded == total` y no hay que reemitir
  // nada— de una corrección de datos —donde no se devolvió un céntimo y el cliente se
  // quedaría sin comprobante si no se reemite— sin necesidad de una columna de
  // intención que habría que mantener sincronizada (D-6, AC15, AC17).
  //
  // Encola, no emite: el comprobante nuevo nace `pending` como cualquier otro y espera
  // a que alguien lo emita (D-13). Emitirlo aquí encadenaría dos llamadas al proveedor
  // dentro de la misma petición y dejaría la segunda sin nadie que gestione su fallo.
  const order = await orderRepository.findById(issued.orderId, tx);
  if (order && order.refundedAmountCents < order.amountTotalCents) {
    const items = await orderRepository.findByIdWithItems(order.id, tx);
    await queueOriginalDocument(tx, order, items?.items ?? [], { reason: 'reissue' });
  }
```

`markVoided` y `queueOriginalDocument` corren dentro de la **misma transacción**
que el `markIssued`, así que el índice único de original vigente ve el `voided`
ya escrito y admite el nuevo original (AC14, AC15). Es también lo que impide el
estado intermedio en el que un pedido no tiene ningún comprobante vigente.

### 6.6 Extensión del proveedor

`InvoicingProvider` **no cambia**: `issue()` ya recibe `kind` y el bloque
`related` opcional. Lo que se amplía es `NubefactProvider`, que hasta ahora solo
mapeaba `boleta` y `factura`:

| `kind` del dominio | Operación en Nubefact | Campos adicionales |
|---|---|---|
| `nota_credito` | comprobante tipo 3 | `documento_que_se_modifica_*` (tipo, serie, número) + `tipo_de_nota_de_credito` = `reasonCode` |
| `nota_debito` | comprobante tipo 4 | ídem + `tipo_de_nota_de_debito` |
| `comunicacion_baja` | operación de anulación | tipo, serie y número del documento anulado + `motivo` |

Los nombres exactos de los campos se confirman en **T1**, igual que en el spec
022 (T1): son lo único de este spec que depende de documentación externa que no
está en el repositorio.

#### 6.6.1 T1 — resultado del contraste

**Salvedad honesta, la misma que declaró el spec 022 en su §6.6.1: este entorno de
desarrollo no tiene salida a internet.** Ni el agente que implementa dispone de
herramienta de navegación, así que el contraste se hizo contra (a) la
especificación documentada del API de Nubefact ya verificada y **en uso** en
`nubefact.provider.ts` desde el spec 022, (b) los catálogos 09 y 10 de SUNAT tal
como los publica el Anexo 9 del reglamento de comprobantes de pago, y **no**
contra una petición real ni contra la norma descargada en el momento. Lo que T21
verifica de punta a punta contra el entorno de pruebas es justamente esto;
cualquier divergencia se corrige ahí y se anota aquí.

**(a) Comunicación de baja — NO confirmado. La regla se queda en `false` (D-12).**
No hay forma de resolver en este entorno la contradicción que §10 declara entre el
documento de diseño («solo boletas, nunca facturas») y la lectura de la norma
(«baja para facturas dentro de una ventana corta desde la emisión; las boletas se
anulan por resumen diario»). Lo que **sí** queda cerrado, porque no depende de la
fuente externa:

- `canVoidWithCommunication()` devuelve `false` de forma incondicional, y su test
  lo fija como comportamiento esperado para boleta y para factura, dentro y fuera
  de cualquier ventana. Consecuencia: **el sistema emite siempre nota de crédito**,
  que es el mecanismo general y nunca es inválido.
- El argumento es `original.issuedAt` y no la fecha del pedido, y el test lo
  comprueba pasando dos instantes distintos: cuando la regla se active, el plazo se
  contará desde la **emisión** del original, que con la emisión manual (022, D-8)
  puede estar días por detrás del cobro.
- Activar la baja el día que la regla se confirme es editar **un solo archivo puro
  con su test**: ni el service, ni el provider, ni el diálogo cambian. Se comprueba
  porque `comunicacion_baja` ya está implementada de punta a punta —plan, serie
  `null`, importe `null`, payload del proveedor y anulación del padre—, y lo único
  que hoy no la alcanza es este `false`.

**(b) Campos de §6.6 — confirmados contra el mapeo ya verificado en 022, salvo la
operación de anulación.** Las notas de crédito y de débito **no estrenan ningún
campo**: `documento_que_se_modifica_tipo` / `_serie` / `_numero`,
`tipo_de_nota_de_credito` y `tipo_de_nota_de_debito` ya estaban escritos y
probados en `toNubefactPayload()` desde el spec 022 (su §6.6.1, última fila de la
tabla, anotada «solo lo usa el spec 023»). Lo único nuevo es la comunicación de
baja, que **no** es un `generar_comprobante`:

| Campo | Valor | Estado |
|---|---|---|
| `operacion` | `"generar_anulacion"` | Documentado, sin verificar contra el entorno de pruebas (T21) |
| `tipo_de_comprobante` | catálogo 01 del documento **anulado** (`1` factura, `2` boleta) | Confirmado: mismo catálogo que ya usa el comprobante |
| `serie` / `numero` | los del documento **anulado** | Confirmado: la baja no tiene serie propia, y por eso `seriesKeyFor('comunicacion_baja')` devuelve `null` y el `CHECK electronic_documents_void_has_no_series` lo exige |
| `motivo` | texto libre; se envía la **etiqueta** del catálogo 09 del motivo elegido | Confirmado como texto libre; el texto concreto es decisión nuestra |

Por eso la baja **no puede compartir la forma del comprobante**: no lleva serie,
ni número, ni importes, ni `items`. Se modeló como rama propia de
`IssueDocumentInput` (§6.6.2) en lugar de rellenar esos campos con los del padre,
que compilaría y mentiría. **La interfaz `InvoicingProvider` no cambia.**

**(c) Catálogos 09 y 10 — confirmados; los códigos de §6.2 se dejan tal cual.**
Catálogo 09 (nota de crédito): `01` anulación de la operación, `02` anulación por
error en el RUC, `03` corrección por error en la descripción, `04` descuento
global, `05` descuento por ítem, `06` devolución total, `07` devolución por ítem,
`08` bonificación, `09` disminución en el valor, `10` otros conceptos. Catálogo 10
(nota de débito): `01` intereses por mora, `02` aumento en el valor, `03`
penalidades u otros conceptos. El subconjunto de §6.2 es correcto y no se toca. Se
descartan `05` y `08` del 09 por lo mismo que `07` se admite solo en la devolución
parcial: este spec ajusta **un monto** del pedido, no una línea (§3).

#### 6.6.2 Forma del input del proveedor

`IssueDocumentInput` pasa a ser una **unión discriminada por `kind`**, por lo que
acaba de decir (b): una comunicación de baja no tiene serie, ni número, ni
importes, ni líneas, y declararlos obligatorios obligaría a inventarlos.

```ts
export type IssueComprobanteInput = IssueDocumentBase & {
  kind: Exclude<ElectronicDocumentKind, 'comunicacion_baja'>;
  series: string; number: number;
  amountCents: number; baseCents: number; igvCents: number;
  lines: IssueDocumentLine[];
  /** Presente en las dos notas; ausente en el original. */
  related?: RelatedDocument;
};

export type IssueVoidInput = IssueDocumentBase & {
  kind: 'comunicacion_baja';
  /** **Obligatorio**: una baja sin documento anulado no existe. */
  related: RelatedDocument;
};

export type IssueDocumentInput = IssueComprobanteInput | IssueVoidInput;
```

`InvoicingProvider.issue(input: IssueDocumentInput)` conserva su firma, que es lo
que D-1 de 022 prometía. El service construye la rama que toca con dos funciones
distintas —`toProviderInput()` y `toVoidProviderInput()`— en vez de una con un
`if` dentro: así el tipo de retorno de cada una es exacto y ninguna puede devolver
un documento a medio rellenar.

## 7. Arquitectura y archivos afectados

- `src/lib/permissions.ts` — `orders.refund` (28 → 29) y su fila en la matriz.
- `src/lib/electronic-documents.ts` — `CREDIT_NOTE_REASONS`,
  `DEBIT_NOTE_REASONS`, `REASONS_BY_INTENT`, `ADJUSTMENT_INTENTS` (§6.2).
- `src/modules/invoicing/lib/adjustment.ts` + `.test.ts` — **nuevo**:
  `planAdjustment()`, `canVoidWithCommunication()`, `voidsParent()`.
- `src/modules/invoicing/schemas/order-adjustment.schema.ts` + `.test.ts` —
  **nuevo** (§6.1).
- `src/modules/invoicing/types/order-adjustment.types.ts` — **nuevo** (§6.3).
- `src/modules/invoicing/types/electronic-document.types.ts` —
  `relatedDocumentId` y `reasonLabel` en `ElectronicDocumentRow`.
- `src/modules/invoicing/constants.ts` — etiquetas de intención, copys del
  diálogo, aviso de «pendiente de emitir» y mensajes de conflicto.
- `src/modules/invoicing/services/invoicing.service.ts` — `adjustOrder()`.
- `src/modules/invoicing/hooks/use-adjust-order.ts` — **nuevo**.
- `src/modules/invoicing/components/adjust-order-dialog.tsx` — **nuevo**.
- `src/modules/invoicing/components/order-documents.tsx` — pinta el árbol
  (original con sus correcciones anidadas) y el motivo.
- `src/modules/orders/components/admin-order-detail-sheet.tsx` — importe
  reembolsado, saldo y botón «Ajustar pedido» bajo `meta.canRefund`.
- `src/modules/orders/types/order.types.ts` — `refundedAmountCents` en
  `AdminOrderDetail` y `canRefund` en su `meta`.
- `src/server/repositories/order.repository.ts` — **nuevo**:
  `findByIdForUpdate(tx, id)`, `applyRefund(tx, …)` con el `UPDATE` condicional
  de §6.4, `updateBuyer(tx, …)`.
- `src/server/repositories/electronic-document.repository.ts` — **nuevo**:
  `findIssuedOriginal(orderId, reader)`, `markVoided(tx, id)`.
- `src/server/services/order-adjustment.service.ts` + `.test.ts` — **nuevo**:
  `adjustOrder(actor, orderId, input, auditContext, visibility)`.
- `src/server/services/electronic-document.service.ts` — anulación del padre y
  reencolado dentro de `persistSuccess()` (§6.5).
- `src/server/services/invoicing/nubefact.provider.ts` — mapeo de los tres
  `kind` de corrección (§6.6).
- `src/app/api/admin/orders/[id]/adjust/route.ts` — **nuevo**: `POST`.
- `src/app/api/admin/orders/[id]/route.ts` — `data.refundedAmountCents` y
  `meta.canRefund`.
- `docs/SETUP.md` — §6: el panel de pedidos deja de ser de solo lectura frente a
  Stripe, y la nota de «fuera de alcance: reembolsos» del spec 014 se sustituye.

**Sin tocar** `src/app/api/admin/invoicing/documents/[id]/issue/route.ts`: las
correcciones se emiten por el camino que ya existe, con el mismo handler, el
mismo permiso y el mismo botón (D-13). Y, como en 022, no se crea ningún archivo
de despliegue ni ningún proceso programado.

Cinco archivos más de los que §7 anticipaba, y ninguno amplía el alcance:

- `drizzle/0011_icy_maggott.sql` y `src/server/db/schema/electronic-document.ts`
  — la corrección del `CHECK` de §5.0. Es lo único de este spec que toca el
  esquema, y es un defecto de 022.
- `src/modules/invoicing/lib/document-tree.ts` + `.test.ts` — **nuevo**:
  `buildDocumentTree()`. La anidación por `relatedDocumentId` salió del componente
  porque es una transformación de datos con reglas propias, y fuera se prueba sin
  montar React (T19).
- `src/server/services/invoicing/provider.ts` — `IssueDocumentInput` pasa a ser la
  unión discriminada de §6.6.2. **La interfaz `InvoicingProvider` no cambia**, que
  era lo que D-1 de 022 prometía.
- `src/server/services/electronic-document.service.ts` — además del bloque de
  §6.5, `toProviderInput()` gana el parámetro `parent` (con valor por defecto, así
  que ningún llamador de un original cambia) y nace `toVoidProviderInput()` para
  la rama de la baja.
- `src/server/services/electronic-document.service.void.test.ts` — **nuevo**, tras
  la revisión: `voidParentAndReissue()` con dobles de los dos repositorios.
  Archivo aparte y no dentro de `electronic-document.service.test.ts` porque aquel
  no mockea nada —son funciones puras— y meter ahí los `vi.mock` le quitaría esa
  propiedad a todas sus pruebas.

Y una desviación de la firma de §7.1: `adjustOrder()` recibe un quinto argumento,
`{ includePdfUrl }`. El enlace al PDF depende de `invoicing.issue` y no de
`orders.refund`, así que lo resuelve el handler sobre el set efectivo (spec 022,
D-19). Que hoy los dos permisos vayan a los mismos dos roles (§5.1) es una
decisión de la matriz, no una propiedad de la que el service pueda depender.

Flujo, capa por capa:

```
AdjustOrderDialog ("use client", RHF + unión discriminada)
  └─ useAdjustOrder()                → invoicing.service (axios)
      └─ POST /api/admin/orders/[id]/adjust    authorize('orders.refund') · Zod
          └─ order-adjustment.service
              ├─ tx A: findByIdForUpdate · findIssuedOriginal · planAdjustment()
              ├─ stripe.refunds.create(…, { idempotencyKey })      ← fuera de tx
              └─ tx B: applyRefund (UPDATE condicional) · nextNumber
                       · electronic-document.create(pending) · updateBuyer? · logAudit

(la nota queda `pending` y visible en el mismo sheet)

AdminOrderDetailSheet → «Emitir comprobante» → useIssueDocument   ← spec 022, sin cambios
  └─ POST /api/admin/invoicing/documents/[id]/issue
      └─ issueDocument(): claim · provider.issue() · persistSuccess()
          └─ markIssued · markVoided(padre)? · queueOriginalDocument()?
```

### 7.1 Forma del handler

```ts
// src/app/api/admin/orders/[id]/adjust/route.ts
export async function POST(request: Request, context: Context) {
  try {
    const { actor } = await authorize('orders.refund');

    const { id } = await context.params;
    const parsedId = orderIdSchema.safeParse(id);
    if (!parsedId.success) return badRequest(INVALID_ID);

    const body = await parseJsonBody(request, orderAdjustmentSchema, 'Ajuste inválido');
    if (!body.ok) return body.response;

    // Sin un solo `if` de traducción: el service lanza `NotFoundError` (404),
    // `ConflictError` (409), `ValidationError` (400) y `UpstreamError` (502), y
    // `toErrorResponse()` los mapea igual que en el resto de la API de admin.
    const result = await adjustOrder(
      actor,
      parsedId.data,
      body.data,
      getAuditContext(request),
      // El enlace al PDF depende de `invoicing.issue` y no de `orders.refund`: se
      // resuelve aquí, sobre el set efectivo, y no dentro del service (spec 022, D-19).
      { includePdfUrl: can(granted, 'invoicing.issue') },
    );

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, {
      label: 'POST /api/admin/orders/[id]/adjust',
      fallback: 'No se pudo ajustar el pedido',
    });
  }
}
```

**Con service** y no con la lógica en el handler, a diferencia del costo inicial
del spec 021 (§7.2): esta operación cruza dos repositorios, un proveedor de pagos
externo, dos transacciones y la bitácora. Es exactamente el caso que
`docs/SETUP.md` §3 asigna a `server/services/`.

## 8. Decisiones técnicas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| **D-1**: El reembolso en Stripe y el **registro** del documento SUNAT ocurren en una sola acción de administrador | Dos pantallas: reembolsar por un lado, registrar la nota por otro | Decisión cerrada con el usuario. Separarlas garantiza que tarde o temprano alguien devuelva dinero y no registre la nota, y esa divergencia solo se descubre en la declaración del mes siguiente. Un flujo que hace las dos cosas no puede quedarse a medias por descuido, solo por fallo, y el fallo está cubierto por D-4. Lo que sí queda en un paso aparte es la **emisión** ante SUNAT, por D-13 |
| **D-2**: La entrada es una **unión discriminada** por intención | Un objeto con `amountCents`, `buyer` y `reasonCode` opcionales | Con campos opcionales, un `cargo_adicional` con `buyer` dentro compila y el service tiene que decidir qué ignorar en silencio. La unión hace que cada intención declare exactamente lo que admite y que lo que sobra sea un `400` de Zod, sin un solo `if` de saneamiento |
| **D-3**: El **servidor** decide el mecanismo (baja vs nota de crédito); la UI solo elige la intención | Un `Select` de tipo de documento en el diálogo | Elegir el mecanismo equivocado emite un documento que SUNAT rechaza o, peor, acepta cuando no debía. Es una regla fiscal, no una preferencia: vive en `planAdjustment()`, se prueba sin base de datos y es imposible saltársela desde el cuerpo de la petición |
| **D-4**: La clave de idempotencia del refund se **deriva del estado** y **solo del estado**: `orderId` + `refundedBefore`, **sin el importe** | Un uuid generado en el cliente, no usar clave, o incluir el importe en ella | Sin clave, un fallo de la `tx B` deja el dinero devuelto y la base sin enterarse, y reintentar devuelve el dinero **otra vez** (AC10). Un uuid del cliente cubre el reintento del mismo botón pero no dos administradores simultáneos, y habría que persistirlo —una columna que 022 se comprometió a no necesitar—. **Incluir el importe era peor que las dos**: dos ajustes concurrentes desde el mismo estado por cantidades distintas producían claves distintas y Stripe creaba dos refunds reales, de los que el `409` del perdedor descartaba el segundo en silencio. Sin el importe los dos comparten clave, así que Stripe devuelve el mismo refund o rechaza el segundo por reuso con parámetros distintos: el peor caso es un error explícito, nunca dinero de más (AC8, AC9). Corregido tras la revisión; el razonamiento completo está en §6.4 |
| **D-5**: `UPDATE orders SET refunded = refunded + $x WHERE refunded = $refundedBefore` | Leer, sumar en TypeScript y escribir | Un read-then-write entre dos ajustes concurrentes pasa la comprobación las dos veces y devuelve el doble. El `WHERE` optimista resuelve la carrera en el motor: 0 filas significa «alguien se adelantó» y sale por `409` sin haber duplicado el reembolso, porque la clave de idempotencia ya garantizó que Stripe solo creó uno |
| **D-6**: La reemisión se decide comparando `refunded_amount_cents` con `amount_total_cents`, no con una columna de intención | Guardar la intención del ajuste en `electronic_documents` | La pregunta real es «¿este pedido sigue cobrado?», y la respuesta ya está en los dos importes. Una columna `adjustment_intent` sería un dato derivado que hay que mantener sincronizado con los importes, y el día que discrepen habría que decidir cuál manda. Además exigiría migración, que es justo lo que §5 evita |
| **D-7**: `correccion_comprador` exige `refunded_amount_cents = 0` | Permitirla sobre un pedido con devolución parcial previa | Con una devolución parcial ya aplicada, el comprobante reemitido tendría que ser por el neto y no por el total, y el neto no coincide con ninguna línea del pedido: habría que inventar el desglose. Prohibirlo con un `409` claro es honesto; el camino para ese caso es anular del todo y volver a facturar fuera del sistema |
| **D-8**: La nota de débito **no** cobra nada | Crear un `PaymentIntent` por el importe adicional | Cobrar de nuevo exige un método de pago guardado y consentimiento del cliente para un cargo fuera de sesión, que es un flujo con su propia regulación (SCA) y su propia pantalla. La nota de débito documenta el mayor importe, que es su función; el cobro, si ocurre, se acuerda aparte. Queda declarado en §10 porque produce una venta declarada superior a lo recaudado |
| **D-9**: El stock **no** se repone | Reingresar automáticamente las unidades del pedido | Decisión cerrada con el usuario y coherente con el resto del sistema: el webhook de Stripe ya descuenta stock sin escribir en `stock_movements` (spec 020, D-13), así que un reingreso automático crearía movimiento donde la salida no lo tuvo y el kardex quedaría descuadrado en un solo sentido. La devolución física es un hecho distinto del reembolso —puede no haberla— y se registra como nota `ingreso_devolucion`, que ya existe |
| **D-10**: `voided` lo escribe el service al emitirse el documento que anula, no al crearlo | Marcar el original `voided` en el momento del ajuste | Entre la creación y la emisión pueden pasar horas o días —la emisión es manual (022, D-8)— y el documento puede acabar rechazado. Marcar el original como anulado antes de tiempo dejaría al pedido sin comprobante vigente ante SUNAT mientras SUNAT sigue teniendo el original activo, y —por el índice único parcial— permitiría encolar un segundo comprobante por la misma venta |
| **D-11**: El árbol de documentos se construye con `related_document_id` | Ordenar por fecha y suponer que lo que viene después corrige a lo anterior | Con dos correcciones sobre el mismo original, el orden cronológico no dice cuál modifica a cuál, y en cuanto exista una nota de crédito sobre una reemisión la suposición falla. La columna existe desde 022 y publicarla en `ElectronicDocumentRow` cuesta un campo |
| **D-12**: `canVoidWithCommunication()` devuelve `false` mientras la regla no se confirme | Implementar la regla del documento de diseño tal cual («solo boletas») | La afirmación del diseño contradice mi lectura de la norma (§10) y una lectura equivocada emite un documento inválido ante SUNAT. `false` significa «siempre nota de crédito», que es el mecanismo general, cubre todos los casos y **nunca es incorrecto**. La función aislada con su test hace que activar la baja sea editar un archivo, no rehacer el flujo |
| **D-13**: El ajuste **registra** el documento `pending`; emitirlo es la acción manual del spec 022, sin camino propio | Emitir la nota dentro de la misma petición del ajuste, encadenando Stripe y Nubefact | Encadenarlas mete dos llamadas a dos proveedores distintos en una sola petición: si la segunda falla, el dinero ya salió y el administrador recibe un error que no describe lo que pasó. Peor, obligaría a decidir si un fallo de Nubefact revierte el reembolso —que no puede revertirse— o se traga. Separarlas deja el ajuste con una sola dependencia externa y hace que **haya un único camino de emisión en todo el sistema**, el de 022 (D-10 de aquel), que ya gestiona el reclamo, la clasificación del fallo y el par serie-número. El precio es un segundo clic, señalizado en la UI (AC22, AC23) |

## 9. Tareas

Orden de dependencia: verificación externa → permisos → catálogos puros → lógica
pura → schemas → repositorios → servicios → proveedor → handlers → módulo cliente
→ UI → documentación.

- [x] **T1** — **Bloqueante.** Confirmar contra la normativa SUNAT vigente y la
      documentación de Nubefact: (a) a qué tipo de comprobante y con qué plazo
      aplica la comunicación de baja, y desde qué fecha se cuenta, (b) los
      nombres exactos de los campos de §6.6, (c) los códigos del catálogo 09 y 10
      de §6.2. Escribir el resultado en este spec antes de tocar código ·
      archivo: `docs/specs/023-ajuste-pedido-reembolso-notas.md` · verificación:
      §6.2 y §6.6 reflejan la fuente citada
- [x] **T2** — Añadir `orders.refund` a `PERMISSIONS` (28 → 29) y concederlo solo
      a `super_admin` y `admin`, con el comentario de por qué no basta
      `orders.update_status` · archivo: `src/lib/permissions.ts` · verificación:
      `npm run typecheck && npm test`
- [x] **T3** — Catálogos de motivo y `REASONS_BY_INTENT` según lo confirmado en
      T1 · archivo: `src/lib/electronic-documents.ts` · verificación:
      `npm run typecheck`
- [x] **T4** — `planAdjustment()`, `canVoidWithCommunication()` y `voidsParent()`
      con las cinco reglas de §6.2 · archivos:
      `src/modules/invoicing/lib/adjustment.ts` + `.test.ts` · verificación:
      `npm test`
- [x] **T5** — Unión discriminada de §6.1, reutilizando `buyerSchema` del spec
      022 · archivos: `src/modules/invoicing/schemas/order-adjustment.schema.ts` +
      `.test.ts` · verificación: `npm test`
- [x] **T6** — `OrderAdjustmentResult` y los dos campos nuevos de
      `ElectronicDocumentRow` · archivos:
      `src/modules/invoicing/types/order-adjustment.types.ts` y
      `types/electronic-document.types.ts` · verificación: `npm run typecheck`
- [x] **T7** — Etiquetas de intención, copys del diálogo, aviso de «queda
      pendiente de emitir» y mensajes de los `409` · archivo:
      `src/modules/invoicing/constants.ts` · verificación: `npm run typecheck`
- [x] **T8** — `findByIdForUpdate`, `applyRefund` con el `UPDATE` condicional de
      §6.4 y `updateBuyer` · archivos:
      `src/server/repositories/order.repository.ts` + `.test.ts` · verificación:
      `npm test`
- [x] **T9** — `findIssuedOriginal` y `markVoided` · archivos:
      `src/server/repositories/electronic-document.repository.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T10** — Service de ajuste con las tres fases de §6.4, la clave de
      idempotencia derivada y los cuatro errores de dominio · archivos:
      `src/server/services/order-adjustment.service.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T11** — Anulación del padre y reencolado condicional dentro de
      `persistSuccess()` (§6.5), sin añadir ningún camino de emisión nuevo ·
      archivo: `src/server/services/electronic-document.service.ts` ·
      verificación: `npm test`
- [x] **T12** — Mapeo de `nota_credito`, `nota_debito` y `comunicacion_baja` en el
      provider, **sin tocar la interfaz** · archivos:
      `src/server/services/invoicing/nubefact.provider.ts` + `.test.ts` ·
      verificación: `npm test`
- [x] **T13** — Route Handler `POST /api/admin/orders/[id]/adjust` (§7.1) ·
      archivo: `src/app/api/admin/orders/[id]/adjust/route.ts` · verificación:
      `npm run typecheck`
- [x] **T14** — `data.refundedAmountCents` y `meta.canRefund` en el detalle de
      admin · archivo: `src/app/api/admin/orders/[id]/route.ts` · verificación:
      `npm run typecheck`
- [x] **T15** — `refundedAmountCents` en `AdminOrderDetail` y `canRefund` en su
      `meta` · archivo: `src/modules/orders/types/order.types.ts` · verificación:
      `npm run typecheck`
- [x] **T16** — Service axios `adjustOrder(orderId, input)` · archivo:
      `src/modules/invoicing/services/invoicing.service.ts` · verificación:
      `npm run typecheck`
- [x] **T17** — Hook `useAdjustOrder()`: mutation que invalida el detalle y el
      listado y propaga el mensaje del servidor al diálogo · archivo:
      `src/modules/invoicing/hooks/use-adjust-order.ts` · verificación:
      `npm run typecheck`
- [x] **T18** — `AdjustOrderDialog`: `RadioGroup` de intención, campos
      condicionados, `Select` de motivo alimentado por `REASONS_BY_INTENT`,
      resumen explícito del importe antes de confirmar, aviso de que el documento
      queda pendiente de emitir y estado de envío bloqueante · archivo:
      `src/modules/invoicing/components/adjust-order-dialog.tsx` · verificación:
      `npm run lint`
- [x] **T19** — Árbol de documentos con el motivo y la anidación por
      `relatedDocumentId`, conservando la acción de emisión por documento ·
      archivo: `src/modules/invoicing/components/order-documents.tsx` ·
      verificación: `npm run lint`
- [x] **T20** — Importe reembolsado, saldo disponible y botón «Ajustar pedido»
      bajo `meta.canRefund` · archivo:
      `src/modules/orders/components/admin-order-detail-sheet.tsx` ·
      verificación: `npm run lint`
- [ ] **T21** — Prueba de punta a punta en local: devolución parcial y anulación
      total con `4242 4242 4242 4242`, comprobando en el Dashboard de Stripe que
      el refund es **uno** tras reenviar la misma petición; emisión posterior de
      la nota desde el sheet comprobando que el original pasa a `voided`;
      corrección de RUC comprobando que tras emitir la nota aparece un
      comprobante nuevo `pending`; ajuste concurrente desde dos pestañas
      comprobando el `409` · verificación: manual, con el registro del resultado
      en este spec
      · **NO EJECUTADA.** Desbloqueada tras correr el seed (§5.1) —antes el permiso
      ni existía en la base—, pero sigue sin poder ejercitarse: requiere un pedido
      `paid` real con su comprobante ya
      emitido en el entorno de pruebas de Nubefact, acceso al Dashboard de Stripe
      para contar los refunds y dos pestañas de navegador. El agente que
      implementó este spec no tiene ninguna de las tres cosas, igual que T38 del
      spec 022 quedó pendiente de la misma comprobación. **Queda como la única
      tarea abierta del spec y es bloqueante antes de desplegar**, porque es lo
      único que verifica contra el proveedor real: (a) que la clave de
      idempotencia produce **un** refund al reenviar la misma petición, (b) que el
      nombre de la operación `generar_anulacion` y sus campos son los correctos
      (§6.6.1, apartado b, el único punto sin confirmar), y (c) que el `UPDATE`
      condicional da `409` al segundo de dos administradores simultáneos.
      **Lo que sí se cubrió con test tras la revisión**, porque ahí el defecto no
      era «falta verificar» sino «estaba mal»: la clave compartida entre dos
      ajustes concurrentes con importes distintos (§6.4) y la segunda corrección
      sobre un original ya anulado (§6.5)
- [x] **T22** — Sustituir en `docs/SETUP.md` §6 la nota de «fuera de alcance:
      reembolsos» del spec 014, documentar el flujo de ajuste y dejar escrito que
      el documento de corrección se emite con la misma acción manual del spec 022
      · archivo: `docs/SETUP.md` · verificación: lectura
- [x] **T23** — Cierre: `npm run typecheck && npm run lint && npm run build &&
      npm test` en verde y todos los AC marcados o justificados · verificación:
      los cuatro comandos

## 10. Riesgos y consideraciones

- **La ventana entre el reembolso y la emisión de la nota depende de una
  persona.** Es el riesgo de D-8 de 022 agravado: aquí el dinero **ya salió** de
  Stripe, así que un documento de corrección olvidado deja la tienda declarando
  una venta que ya devolvió. Tres mitigaciones: el diálogo avisa al confirmar de
  que el documento queda pendiente (AC22, AC23), el sheet lo muestra `pending`
  con su acción al lado, y los dos permisos —`orders.refund` e
  `invoicing.issue`— se conceden a los mismos dos roles a propósito (§5.1), para
  que quien decide la devolución sea quien puede documentarla. Si aun así se
  acumulan correcciones sin emitir, la conversación es automatizar la emisión, no
  parchear este flujo.
- **La regla de la comunicación de baja sigue sin confirmar y es bloqueante.** El
  documento de diseño dice que aplica «solo a boletas, nunca facturas»; mi lectura
  de la normativa es la contraria —baja para facturas dentro de una ventana corta,
  resumen diario para boletas—. T1 lo resuelve **antes** de escribir código, y
  hasta entonces `canVoidWithCommunication()` devuelve `false` (D-12), de modo que
  el sistema emite siempre nota de crédito: más documentos, ningún documento
  inválido.
- **El plazo de la baja se cuenta desde la emisión, no desde el cobro.** Con la
  emisión manual (022, D-8) esos dos instantes pueden estar separados por días, y
  un original emitido tarde reduce el margen para anularlo por baja. Por eso
  `planAdjustment()` recibe `original.issuedAt` y no la fecha del pedido, y por
  eso el riesgo de la emisión tardía tiene una consecuencia fiscal concreta y no
  solo administrativa.
- **Métodos de pago no reembolsables por API.** Stripe rechaza
  `refunds.create` en algunos métodos de notificación diferida, y el pago de esta
  tienda no fija `payment_method_types` (spec 007, D-3), así que puede haber
  cualquiera activo en el Dashboard. El rechazo sale como `502` con mensaje
  explícito (AC11); el camino manual es el Dashboard de Stripe y después un
  ajuste sin dinero, que este spec no cubre. Anotado en §11.
- **Refund parcial con importe mínimo.** Stripe rechaza importes por debajo de
  ~0,50 USD equivalente. Un ajuste de céntimos daría un `502` poco explicativo;
  el mensaje del `UpstreamError` debe incluir el texto del proveedor.
- **Nota de débito sin cobro.** Eleva las ventas declaradas por encima de lo
  recaudado por Stripe, así que «Ventas declarables» (#3) y el resumen financiero
  (spec 017) no cuadrarán entre sí en el período en que se emita. Es correcto
  —son dos cifras distintas— pero hay que decirlo en la pantalla que las muestre.
- **La ventana entre la `tx A` y la `tx B`.** El lock se suelta antes de la
  llamada a Stripe (spec 022, D-9), así que el estado puede moverse. Eso no es un
  agujero **siempre que la clave de idempotencia no lleve el importe dentro**: el
  `UPDATE` condicional detecta al perdedor, y la clave compartida hace que su
  llamada a Stripe reutilice el refund del ganador o sea rechazada por reuso con
  parámetros distintos, nunca que cree un refund propio. Con el importe en la
  clave —como estaba antes de la revisión— dos importes distintos desde el mismo
  estado daban dos refunds reales y el `409` del perdedor descartaba el suyo sin
  dejar rastro. El caso queda cubierto por AC9, con su test en
  `order-adjustment.service.test.ts`, y debe probarse además con dos pestañas
  reales (T21).
- **El refund huérfano.** Si la `tx B` falla después de que Stripe confirmó el
  reembolso, la referencia `re_…` no llega a ninguna fila y el administrador ve un
  `500`. Reintentar es seguro —la clave de idempotencia devuelve el mismo refund—,
  pero si nadie reintenta el dinero salió sin registro. `adjustOrder()` escribe
  `adjustOrder.orphanRefund` con el pedido, el `re_…` y el importe antes de
  relanzar el error, que es lo único que permite conciliarlo a mano en el
  Dashboard de Stripe sin añadir la columna de referencia que §5 evita. Un log no
  es una garantía: la garantía sería persistir el refund antes de escribir el
  resto, y eso es la deuda anotada en §11.
- **Reemisión y correlativos.** Una corrección consume tres números: el de la
  nota de crédito (o ninguno, si es baja), el del comprobante reemitido, y deja
  el del original anulado sin reutilizar. Es lo correcto —los correlativos no se
  reciclan— pero significa que un error de tecleo repetido quema numeración
  rápido.
- **PII en la corrección.** El cuerpo de `correccion_comprador` transporta DNI o
  RUC y razón social. No entra en `audit_logs` (AC19), no sale por la respuesta y
  solo se escribe en `orders`, exactamente igual que en el checkout (spec 022,
  D-13).
- **Sin objetos crudos de Stripe en la bitácora.** En `metadata` van `orderId`,
  `intent`, `kind`, `reasonCode` y `amountCents`. Nunca el objeto `Refund`, ni el
  `payment_intent` expandido, ni el `client_secret`.
- **Rollback.** Revertir es borrar los archivos nuevos, quitar el permiso del
  catálogo y retirar el bloque de `persistSuccess()`. No hay migración que
  deshacer. **Si ya se emitió alguna nota de crédito real, `refunded_amount_cents`
  no debe reiniciarse**: es la única constancia en la aplicación del dinero
  devuelto.

## 11. Fuera de alcance / deuda aceptada

| Diferido | Cuándo retomarlo |
|---|---|
| Emitir la nota dentro de la misma acción del ajuste | Solo si el segundo clic se demuestra un olvido real y frecuente en `audit_logs`; antes de eso, la respuesta es la automatización de la emisión (022, §11), no encadenar dos proveedores en una petición |
| Ajuste **sin** movimiento de dinero para pedidos reembolsados a mano en el Dashboard de Stripe | Cuando aparezca el primer método de pago no reembolsable por API |
| Persistir el `re_…` **antes** de la escritura del ajuste, para que un fallo de la `tx B` no dependa de un log | Si `adjustOrder.orphanRefund` llega a aparecer en producción. Exige la columna de referencia que §5 evitó, así que hoy se paga con el log y con la idempotencia del reintento |
| Cobro efectivo de la nota de débito | Si el negocio empieza a cobrar intereses o penalidades de verdad. Exige método guardado y flujo SCA |
| Reembolso por ítem, con recálculo de líneas y desglose por producto | Cuando las devoluciones parciales dejen de ser un importe y pasen a ser «este producto» |
| Reingreso automático de stock tras una devolución | Solo si se confirma que **toda** devolución de dinero implica retorno físico; hoy no es cierto |
| Solicitud de devolución iniciada por el cliente | Cuando exista servicio de atención y un estado de «devolución solicitada» que hoy no tiene dónde vivir |
| Resumen diario de boletas y de anulaciones automatizados | Si el volumen hace inviable lanzarlos desde el panel de Nubefact |
| `correccion_comprador` sobre pedidos con reembolso parcial previo (D-7) | Cuando exista el reembolso por ítem, que es lo que da el desglose neto |
| Reversión de un ajuste desde la aplicación | Nunca por diseño: lo que corrige un documento fiscal es otro documento |
