# Sub-proyecto #3 — Ingresos v2 (ventas confirmadas vs. declarables)

**Fecha:** 2026-09-21
**Tipo:** documento de brainstorming (superpowers), previo a la fase SDD.
Continúa el roadmap de
[2026-09-21-modulo-finanzas-design.md](./2026-09-21-modulo-finanzas-design.md),
sub-proyecto #3. **Depende de #0**
([2026-09-21-facturacion-electronica-design.md](./2026-09-21-facturacion-electronica-design.md)):
usa la tabla `electronic_documents` que ese sub-proyecto crea.

## 1. Contexto verificado

- Hoy (spec `017-admin-finance.md`) "Ingresos" = `sum(amount_total_cents)`
  sobre `orders.status = 'paid'`. Es el mismo número que el KPI de ventas
  del dashboard (spec 015) para el mismo rango — decisión deliberada de
  017, D-10, para que dos pantallas no digan cifras distintas.
- Con #0 construido, un pedido `paid` no garantiza tener ya un comprobante
  SUNAT **emitido**: la emisión es asíncrona con reintentos, así que puede
  haber una ventana (normalmente minutos) donde el pedido está pagado pero
  el documento sigue `pending` o incluso `failed`.
- `electronic_documents` (de #0) puede tener, para un mismo pedido: el
  original (`boleta`/`factura`) y correcciones (`nota_credito`,
  `nota_debito`, `comunicacion_baja`) que reducen o aumentan lo
  efectivamente facturado.

## 2. Decisión tomada con el usuario

**Se muestran los dos números, lado a lado**, porque responden preguntas
distintas y una sola pantalla las necesita ambas:

- **Ventas confirmadas**: lo que ya existe (`orders.status = 'paid'`). Sigue
  siendo el número operativo del día a día, igual al del dashboard.
- **Ventas declarables**: basado en `electronic_documents` con `status =
  'issued'`, neto de correcciones. Es el número que un contador usaría para
  el Registro de Ventas.

No se reemplaza nada existente — se agrega el segundo número al lado del
primero.

## 3. Alcance

### Incluye

- Cálculo de **Ventas declarables** (§5) y su card en `/admin/finance`,
  junto a "Ventas confirmadas" (renombrado desde el actual "Ingresos" para
  que la diferencia sea explícita en la propia etiqueta).
- Desglose de ventas declarables por tipo de comprobante (boleta / factura)
  — útil porque el Registro de Ventas de SUNAT los trata como columnas
  separadas, y porque solo la factura interesa para el crédito fiscal de
  quien compra.
- Un ajuste menor al modelo de #0: `electronic_documents` gana
  `issued_at` (`timestamptz` nullable), la fecha real de emisión que
  informa el proveedor (o el momento en que nuestro sistema la confirma, si
  el proveedor no la trae). **Ventas declarables** filtra por este campo,
  no por `updated_at` — evita que un cambio de estado no relacionado con la
  emisión (ej. un futuro campo que también dispare `$onUpdate`) contamine
  la fecha que de verdad importa para el libro de ventas.
- Un indicador simple de salud: cuántos pedidos `paid` del rango **no**
  tienen todavía un `electronic_documents` en `issued` (sin duplicar la
  vista de reintentos que ya construye #0 en `/admin/orders` — aquí es solo
  un conteo, con enlace a esa vista).

### No incluye (explícito)

- **Impuesto a pagar.** Este sub-proyecto solo produce la cifra de ventas;
  restar el IGV de compras (#2) y calcular lo declarable es el #4.
- **Reemplazo del KPI del dashboard** (spec 015). El dashboard sigue
  mostrando "ventas" con su propia definición (`paid`); alinearlo con
  "declarables" no se pide y cambiaría una pantalla que no es de este
  módulo.
- **Ventas por otros canales** (ej. venta presencial, si existiera). Todo
  el proyecto asume que la única fuente de ventas es el checkout de Stripe.

## 4. Modelo de datos

Sin tabla nueva. Un único ajuste sobre lo ya diseñado en #0:

| Cambio | Tabla | Nota |
|---|---|---|
| + `issued_at` | `electronic_documents` | `timestamptz` nullable, se llena cuando `status` pasa a `issued` |

## 5. Reglas de cálculo (normativas)

**Ventas confirmadas** (sin cambios): `sum(orders.amount_total_cents)` con
`status = 'paid'`, en el rango.

**Ventas declarables**, en el mismo rango, filtrando `electronic_documents`
por `issued_at`:

```
ventasDeclarables =
    sum(amount_cents WHERE kind IN ('boleta','factura') AND status = 'issued')
  − sum(amount_cents WHERE kind = 'nota_credito'      AND status = 'issued')
  + sum(amount_cents WHERE kind = 'nota_debito'        AND status = 'issued')
```

`comunicacion_baja` no suma ni resta: no lleva `amount_cents` (§5 de #0) —
anula el original, así que el original simplemente deja de contar una vez
que la baja queda `issued` (se resuelve con un `NOT EXISTS` de baja emitida
sobre ese documento, no con una resta de monto).

**Desglose por tipo**: mismo filtro, agrupado por `kind` ∈
{`boleta`, `factura`}, cada uno neto de sus propias notas de
crédito/débito (una nota de crédito de una factura no debe descontarse del
total de boletas).

## 6. Vista

- `/admin/finance`: la card actual "Ingresos" se renombra a **"Ventas
  confirmadas"**; se agrega **"Ventas declarables"** al lado, con su propio
  desglose boleta/factura (barras simples, mismo estilo que el desglose de
  gastos por categoría de spec 017 — sin gráficos nuevos, D-13 se mantiene).
- Debajo de ambas cards, un texto simple: *"N pedidos pagados sin
  comprobante emitido todavía →* enlace a `/admin/orders` filtrado por
  pendientes" — visibilidad de la brecha entre las dos cifras, sin
  duplicar la gestión de reintentos que ya vive ahí.

## 7. Permisos

Sin permisos nuevos: sigue detrás de `finance.read`, igual que hoy.

## 8. Riesgos y decisiones abiertas para la fase SDD

- **Si Nubefact devuelve su propia fecha/hora de emisión** en la respuesta
  de la API — de ser así, `issued_at` se llena con ese dato; si no, con el
  reloj del servidor al procesar la respuesta. Se confirma contra la
  documentación de Nubefact en la fase SDD de #0 (este documento asume que
  el campo existe, pero su origen exacto se resuelve ahí).
- **Ventana de discrepancia esperable** entre las dos cifras — no se fija
  un umbral de alerta aquí; si el indicador de salud (§6) muestra
  regularmente muchos pedidos sin comprobante, es una señal para revisar el
  cron de #0, no algo que este sub-proyecto deba resolver.

## 9. Relación con el resto del roadmap

Ventas declarables (§5) es el insumo directo del lado de "ventas" del
sub-proyecto #4 (Impuestos), que lo cruzará contra el IGV de compras que
aporta el #2 (Egresos v2). Ganancias v2 (#5) también consumirá esta cifra
para una utilidad más alineada a lo declarado, en vez de a lo cobrado.
