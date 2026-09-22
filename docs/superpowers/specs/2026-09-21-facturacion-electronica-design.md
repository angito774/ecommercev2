# Sub-proyecto #0 — Facturación electrónica (SUNAT)

**Fecha:** 2026-09-21
**Tipo:** documento de brainstorming (superpowers), previo a la fase SDD.
Continúa el roadmap de
[2026-09-21-modulo-finanzas-design.md](./2026-09-21-modulo-finanzas-design.md),
sub-proyecto #0 — prerrequisito de Impuestos (#4), Contabilidad (#6) e
Ingresos v2 (#3).

## 1. Contexto verificado

- El checkout (spec `007-stripe-checkout.md`) redirige a una sesión hospedada
  de Stripe (`checkout.stripe.com`) y fulfilla el pedido **solo** desde el
  webhook `POST /api/webhooks/stripe`, nunca desde la página de éxito (D-4).
  Maneja `checkout.session.completed`, `async_payment_succeeded`,
  `async_payment_failed` y `expired`.
- `orders` no tiene ninguna columna de documento de identidad del comprador;
  `users` tampoco. El recibo que hoy ve el cliente es el de Stripe
  (`Charge.receipt_url`, spec `008`), que **no** es un comprobante SUNAT.
- No existe RUC de la empresa, razón social ni domicilio fiscal en ningún
  lado del proyecto (ni esquema ni `.env.example`).
- Stripe corta la respuesta del webhook a los ~10 s (spec 007, nota final).
  Cualquier llamada externa síncrona dentro de ese handler compite con ese
  límite.
- **El proyecto no tiene ningún flujo de reembolso o cancelación
  post-pago.** `order_status` solo tiene `canceled` para sesiones de Stripe
  expiradas *antes* de pagar (D-7 de spec 007); no hay ningún camino que
  devuelva dinero después de `paid`. Este sub-proyecto lo construye, porque
  la nota de crédito lo exige.

## 2. Decisiones tomadas con el usuario

| Decisión | Elegido |
|---|---|
| Proveedor | **Nubefact** (OSE/PSE autorizado SUNAT, API REST). Diseño desacoplado detrás de una interfaz propia para poder cambiar de proveedor sin tocar el resto del sistema |
| Tipos de comprobante original | **Boleta** (consumidor final, DNI opcional) por defecto, **Factura** opcional (empresa con RUC + razón social) |
| Momento de emisión | **Asíncrono, con reintentos** — el fulfillment del pedido (stock, `paid`, auditoría) no depende de que Nubefact responda |
| Captura del documento del comprador | **En nuestro propio checkout**, antes de crear la sesión de Stripe (no en la página hospedada de Stripe) |
| Correcciones | Se incluyen **nota de crédito**, **nota de débito** y **comunicación de baja**, cubriendo cancelación/devolución total, devolución o ajuste parcial, y corrección de error en el comprobante |
| Reembolso en Stripe | **Integrado**: la misma acción de admin reembolsa en Stripe (total o parcial) *y* emite el documento SUNAT correspondiente, en un solo flujo |

## 3. Los tres mecanismos de corrección (por qué existen tres)

- **Comunicación de baja**: anula un comprobante **completo**. Solo aplica a
  **boletas** (nunca facturas) y solo dentro de una ventana de tiempo corta
  desde la emisión. El plazo exacto **no se fija en este documento** — SUNAT
  lo ha modificado en el pasado y se confirma contra la documentación
  vigente de Nubefact/SUNAT en la fase SDD.
- **Nota de crédito**: corrige o anula, boleta o factura, dentro o fuera de
  la ventana de baja, total o parcial. Es el mecanismo general y el único
  que cubre devoluciones parciales. Lleva un motivo del catálogo 09 de SUNAT
  (anulación de la operación, devolución total, devolución por ítem,
  corrección por error en la descripción, descuento global, etc.).
- **Nota de débito**: el caso inverso — aumenta un monto ya facturado.
  Catálogo 10 de SUNAT. Menos frecuente en este negocio, pero se modela
  igual que la nota de crédito para no dejar un camino sin construir el día
  que haga falta.

Regla de negocio para decidir cuál usar, resuelta en servidor (no en la UI):
boleta + anulación total + dentro de la ventana → se ofrece baja como
opción más simple; cualquier otro caso → nota de crédito/débito.

## 4. Alcance

### Incluye

- Datos fiscales del comprador en el checkout: tipo de comprobante
  (boleta/factura), tipo y número de documento (DNI/RUC) y, si es factura,
  razón social.
- Validación de formato **offline** (sin llamar a RENIEC/SUNAT): DNI de 8
  dígitos, RUC de 11 dígitos con su dígito verificador (algoritmo módulo 11,
  público).
- Datos fiscales del emisor (RUC, razón social, domicilio fiscal) como
  configuración de servidor, no editable desde el panel en esta versión.
- Emisión asíncrona con reintentos del comprobante original (boleta/factura)
  al confirmarse el pago.
- Flujo de admin "Ajustar pedido": anulación total, devolución parcial o
  corrección sin movimiento de dinero, con motivo del catálogo SUNAT
  correspondiente. Si implica devolver dinero, ejecuta el reembolso en
  Stripe (`stripe.refunds.create`) y emite la nota de crédito/débito o la
  comunicación de baja en el mismo flujo.
- El cliente ve todos los documentos de su pedido (original + correcciones)
  en "Mis compras", con enlace al PDF de cada uno.
- Vista en `/admin/orders`: historial de documentos por pedido, monto
  reembolsado acumulado, y acción "Reintentar" para emisiones fallidas.

### No incluye (explícito)

- **Guías de remisión electrónicas.** No aplica: la tienda no reporta
  transporte de mercadería como hecho separado de la venta.
- **Validación en línea de RUC/DNI** contra RENIEC o el padrón de SUNAT
  (costo y credenciales adicionales; queda la validación offline de
  formato).
- **Panel de configuración de datos del emisor.** RUC, razón social y
  domicilio fiscal son configuración de servidor, no un formulario.
- **Reenvío de comprobante por correo.** Se decide con el resto de
  notificaciones transaccionales del proyecto (no existe ese sistema hoy).
- **Multi-serie por sucursal o punto de venta.** Una sola serie por tipo de
  documento, como corresponde a una sola tienda online.
- **Reembolsos parciales por ítem con re-cálculo de stock.** El reembolso
  de este sub-proyecto es sobre un **monto**, no reingresa stock
  automáticamente — eso, si se necesita, se registra a mano como nota de
  ingreso por devolución (spec 020, tipo `ingreso_devolucion`), que ya
  existe y es un proceso separado del fiscal.

## 5. Modelo de datos (propuesta para el spec)

### 5.1 `orders` — columnas nuevas

| Columna | Tipo | Nota |
|---|---|---|
| `buyer_document_type` | enum `'dni' \| 'ruc'` | Determina boleta vs factura, capturado en checkout |
| `buyer_document_number` | `varchar(11)` | 8 dígitos si `dni`, 11 si `ruc` |
| `buyer_legal_name` | `varchar(160)` nullable | Solo con `ruc` (factura) |
| `refunded_amount_cents` | `integer` not null default `0` | Suma acumulada de reembolsos (parciales o total). `CHECK <= amount_total_cents` — nunca se reembolsa más de lo pagado |

Se decide **no** tocar `order_status`: el estado de reembolso se deriva
comparando `refunded_amount_cents` con `amount_total_cents`
(`0` = sin reembolso, `< total` = parcial, `= total` = total), en vez de
sumar valores al enum que se solaparían con `status = 'paid'`.

### 5.2 Tabla nueva `electronic_documents`

Ya no es "un comprobante por pedido": es un **árbol** — el original
(boleta/factura) y, opcionalmente, sus correcciones referenciándolo.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` PK | |
| `order_id` | `uuid` → `orders.id` `restrict` | Varias filas por pedido posibles |
| `related_document_id` | `uuid` nullable, self-FK `restrict` | `null` en el original; apunta al documento que corrige en NC/ND/baja |
| `kind` | enum `'boleta' \| 'factura' \| 'nota_credito' \| 'nota_debito' \| 'comunicacion_baja'` | |
| `reason_code` | `varchar(4)` nullable | Catálogo 09 (NC) o 10 (ND) de SUNAT; `null` en boleta/factura/baja |
| `amount_cents` | `integer` nullable | Monto del documento; `null` en `comunicacion_baja` (no lleva importe) |
| `status` | enum `'pending' \| 'issued' \| 'failed' \| 'voided'` | `pending` al crearse |
| `series` | `varchar(4)` nullable | Asignada por Nubefact al emitir |
| `number` | `integer` nullable | Correlativo que devuelve Nubefact |
| `pdf_url` / `xml_url` / `cdr_url` | `text` nullable | |
| `provider_response` | `jsonb` nullable | Respuesta cruda de Nubefact, para depurar rechazos |
| `stripe_refund_id` | `varchar(255)` nullable | Solo si este documento implicó reembolso en Stripe |
| `attempt_count` | `integer` default `0` | |
| `last_attempt_at` | `timestamptz` nullable | |
| `created_by_id` | `uuid` nullable → `users.id` `restrict` | `null` = generado por el sistema (el original, vía webhook); con valor = admin que disparó el ajuste |
| `created_at` / `updated_at` | `timestamptz` | |

Invariante que vive en el repositorio, no solo en Zod: la suma de
`amount_cents` de los documentos `kind IN ('nota_credito')` menos los
`nota_debito`, para un pedido, nunca supera `orders.amount_total_cents` —
es la misma regla que sostiene `refunded_amount_cents`, y se escriben en la
misma transacción para que no puedan divergir.

### 5.3 Configuración del emisor y del proveedor

Variables de entorno (mismo patrón que Stripe/Clerk):
`INVOICING_COMPANY_RUC`, `INVOICING_COMPANY_LEGAL_NAME`,
`INVOICING_COMPANY_ADDRESS`, `NUBEFACT_API_URL`, `NUBEFACT_API_TOKEN`,
`NUBEFACT_BOLETA_SERIES`, `NUBEFACT_FACTURA_SERIES`,
`NUBEFACT_NOTA_CREDITO_SERIES`, `NUBEFACT_NOTA_DEBITO_SERIES`. La skill
`vercel:env-vars` se usa cuando esto llegue a implementación.

## 6. Arquitectura

```
Checkout (nuestra página)
  → captura tipo/número de documento (+ razón social si factura)
  → valida formato (DNI 8 dígitos / RUC módulo 11)
  → crea la orden (pending) con esos datos ya en `orders`
  → crea la sesión de Stripe

Stripe ──► POST /api/webhooks/stripe (checkout.session.completed)
  → fulfillment existente (stock, `paid`, audit_logs) — SIN CAMBIOS
  → inserta `electronic_documents` (kind boleta/factura, pending), misma transacción

Cron (nuevo, ej. cada 1-2 min)
  → toma `electronic_documents` en `pending` o `failed` con intentos < tope
  → llama a Nubefact vía cliente propio (`src/server/services/invoicing/`)
  → éxito: status → `issued`, guarda serie/número/URLs
  → fallo: status → `failed`, incrementa `attempt_count`, guarda `provider_response`
  → mismo cron procesa NC/ND/baja pendientes: no hay una cola separada

/admin/orders → "Ajustar pedido" (nuevo, admin)
  → admin elige: anulación total / devolución parcial (monto) / corrección sin dinero
  → servidor resuelve si aplica comunicación de baja o nota de crédito/débito (§3)
  → si hay dinero de por medio: stripe.refunds.create() primero
  → en la misma transacción: `electronic_documents` (pending, related_document_id
    = original) + `orders.refunded_amount_cents` actualizado + audit_logs
  → el cron recoge esa fila `pending` igual que el documento original

Mis compras (spec 008, evoluciona)
  → lista todos los `electronic_documents` `issued` del pedido con su PDF
  → si el original aún no se emitió, mismo fallback al recibo de Stripe de hoy

/admin/orders (spec 014, evoluciona)
  → árbol de documentos por pedido, monto reembolsado acumulado
  → acción "Reintentar" cuando status = 'failed' y se agotaron los reintentos automáticos
```

El cliente de Nubefact vive detrás de una interfaz propia
(`InvoicingProvider`, con métodos para cada `kind`) para que cambiar de
proveedor sea implementar una clase nueva, no reescribir el cron.

## 7. Permisos (propuesta)

- Ver documentos y su estado en `/admin/orders`: reutiliza `orders.read`.
- Reintentar una emisión fallida: `invoicing.retry` (ya propuesto), solo
  `super_admin`/`admin`.
- Disparar "Ajustar pedido" (reembolso + NC/ND/baja): permiso nuevo
  `orders.refund`, solo `super_admin`/`admin` — mueve dinero real en
  Stripe, así que empieza con el mismo criterio restrictivo que el resto de
  finanzas (spec 017, D-3), no con el de `orders.update_status` que ya
  tiene `manager`.

## 8. Riesgos y decisiones abiertas para la fase SDD

- **Ventana exacta de la comunicación de baja** — se confirma contra la
  documentación vigente de Nubefact/SUNAT, no se fija aquí.
- **Tope de reintentos y backoff** del cron — detalle de implementación.
- **Reembolso parcial de Stripe cuando el pago fue con cuota/BNPL o método
  no reembolsable por API** — Stripe puede rechazar el `refunds.create` en
  algunos métodos; el flujo necesita un mensaje de error claro, no
  silencioso.
- **Reingreso de stock tras una devolución física** — queda fuera (§4);
  si en la práctica siempre debe reingresar stock, es una decisión a
  revisar antes de construir, no después.
- **Costo por comprobante de Nubefact** (incluye NC/ND, más documentos que
  el original) — conversación comercial con el proveedor, no se decide
  aquí.
- **Afiliación SUNAT previa**: la empresa necesita estar afiliada al
  régimen de emisión electrónica con su RUC habilitado — trámite fuera del
  código, prerrequisito operativo.

## 9. Fuentes

- [Integración API NubeFacT](https://www.nubefact.com/integracion)
- [Diferencias entre OSE y PSE — NubeFacT](https://www.nubefact.com/blog/facturacion-electronica/diferencias-entre-ose-y-pse-cual-elegir-para-tu-negocio)
