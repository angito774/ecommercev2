# Sub-proyecto #5 — Ganancias v2 (utilidad bruta, operativa y neta)

**Fecha:** 2026-09-21
**Tipo:** documento de brainstorming (superpowers), previo a la fase SDD.
Continúa el roadmap de
[2026-09-21-modulo-finanzas-design.md](./2026-09-21-modulo-finanzas-design.md),
sub-proyecto #5. **Depende de #1** (costo promedio), **#2** (gastos con
IGV), **#3** (ventas declarables), **#4** (Renta RER) y de la nómina
(spec `018-admin-payroll.md`, ya construida).

## 1. Contexto verificado

- Spec 017 calcula hoy `netCents = revenueCents − expensesCents`, con su
  propia advertencia explícita de que **no** es utilidad contable (falta el
  costo de lo vendido). Este sub-proyecto es exactamente lo que esa nota
  dejó pendiente.
- `order_items` (spec 007) congela `price_cents_snapshot` por línea, pero
  **no** tiene ninguna columna de costo — no hay forma hoy de saber cuánto
  costó lo que se vendió en un pedido específico.
- `payroll_payments` (spec 018) ya existe: `employee_id`, `period`
  (`AAAA-MM`), `paid_at`, `amount_cents`, `voided_at` (nulo = pago vivo).
  Sumar nómina de un rango es `sum(amount_cents) WHERE voided_at IS NULL
  AND paid_at BETWEEN …`.

## 2. Decisiones tomadas con el usuario

| Decisión | Elegido |
|---|---|
| Base de ventas para la utilidad bruta | **Ventas declarables** (#3), no confirmadas — toda la jerarquía de utilidad queda anclada a la misma base fiscal que usan Renta e IGV (#4) |
| Gastos operativos en la utilidad | **Netos del IGV recuperable**: un gasto con factura/recibo por honorarios resta solo su base (el IGV vuelve como crédito fiscal, no es un costo real); un gasto con boleta o sin comprobante resta el monto completo |

## 3. Alcance

### Incluye

- Columna nueva `order_items.cost_cents_snapshot`: el costo promedio del
  producto (`products.average_cost_cents`, #1) **congelado en el momento en
  que se confirma la venta** (el mismo instante en que hoy se descuenta el
  stock en el webhook de fulfillment, spec 007) — no antes, para que
  refleje el costo real vigente cuando la venta se concreta, no el del
  momento en que se creó el carrito.
- Los tres niveles de utilidad (§5), reemplazando el "neto" simplificado
  actual de `/admin/finance` — no coexisten los dos números, para no tener
  dos cifras de "ganancia" distintas en la misma pantalla.
- Un indicador explícito de **COGS incompleto** cuando alguna línea vendida
  no tiene costo registrado (`cost_cents_snapshot` nulo porque el producto
  nunca tuvo un `average_cost_cents` al momento de la venta) — la utilidad
  bruta de ese rango se marca como "parcial", **nunca** se asume costo `0`
  para esas líneas (mismo criterio de integridad que #1: sin dato no se
  inventa un número).

### No incluye (explícito)

- **Reemplazar la base de ventas del dashboard** (spec 015). Sigue con la
  suya, como ya estableció #3.
- **Costeo retroactivo.** Pedidos ya fulfillados antes de este sub-proyecto
  quedan con `cost_cents_snapshot = null` en todas sus líneas — no se
  reconstruye historia con el costo promedio de hoy, sería inventar un dato
  que no existió en ese momento.
- **Comisiones de pasarela de pago (Stripe) como línea propia de la
  utilidad.** Sigue siendo un gasto más, a registrar a mano en Egresos si
  se quiere descontar (criterio ya fijado en spec 017, §3).
- **Cierre de período / bloqueo de meses pasados.** Igual que el resto del
  módulo (spec 017, D-8).

## 4. Modelo de datos

### `order_items` — columna nueva

| Columna | Tipo | Nota |
|---|---|---|
| `cost_cents_snapshot` | `integer` nullable | Costo unitario promedio al momento de confirmarse la venta. `null` = sin costo registrado en ese momento (§3) |

Sin tabla nueva: los tres niveles de utilidad son un cálculo, no un dato
que se persista — mismo criterio que el resto del módulo financiero (no
hay tabla de "resultados mensuales").

## 5. Reglas de cálculo (normativas)

**Ingreso neto del período** (base para toda la jerarquía, distinto del
`amount_cents` bruto que muestra la card "Ventas declarables" de #3):
```
ingresoNeto = sum(electronic_documents.base_cents), misma fórmula de signos que #3
              (boleta+factura − nota_credito + nota_debito, todo `issued`)
```

**COGS del período** (por las órdenes cuyo documento cae en el rango):
```
cogs = sum(order_items.cost_cents_snapshot × quantity)
       para líneas de pedidos con electronic_document issued en el rango
```
Si alguna línea del rango tiene `cost_cents_snapshot = null`, el COGS de
ese rango es **parcial**: se calcula igual con lo que hay, pero la UI lo
marca explícitamente (§6) — nunca se trata el nulo como `0`.

**Utilidad Bruta:**
```
utilidadBruta = ingresoNeto − cogs
margenBruto% = utilidadBruta / ingresoNeto × 100   (null si ingresoNeto = 0, igual criterio que #1/#4)
```

**Gastos operativos netos** (del rango, de `expenses` #2):
```
gastosNetos = sum(base_cents  WHERE receipt_type IN ('factura','recibo_honorarios'))
            + sum(amount_cents WHERE receipt_type IN ('boleta','otro') OR receipt_type IS NULL)
```

**Utilidad Operativa:**
```
utilidadOperativa = utilidadBruta − gastosNetos − nomina
margenOperativo% = utilidadOperativa / ingresoNeto × 100
```
`nomina = sum(payroll_payments.amount_cents) WHERE voided_at IS NULL AND
paid_at` en el rango.

**Utilidad Neta:**
```
utilidadNeta = utilidadOperativa − rentaEstimada   (#4)
margenNeto% = utilidadNeta / ingresoNeto × 100
```
El IGV (#4) **no** resta aquí: es un tributo de terceros que la empresa
solo recauda y traslada, no un costo ni un gasto de la empresa.

## 6. Vista

- `/admin/finance` reemplaza la card única "Neto" por **tres filas**:
  Utilidad Bruta, Utilidad Operativa, Utilidad Neta, cada una con su monto
  y su margen %, en ese orden descendente (mismo patrón visual que un
  estado de resultados). Con signo negativo se marca "Pérdida" con color +
  ícono + texto, igual criterio ya establecido (spec 017, AC9).
- Si hay COGS parcial en el rango, aviso bajo la Utilidad Bruta: *"Cálculo
  parcial: N línea(s) vendida(s) sin costo registrado"* con enlace a
  `/admin/finance/pricing` (#1) para completar los costos faltantes.
- Sin gráficos nuevos (mismo criterio D-13 de spec 017).

## 7. Permisos

Sin permisos nuevos: sigue detrás de `finance.read`, es un cálculo de
lectura sobre datos que ya están protegidos por sus propios módulos.

## 8. Riesgos y decisiones abiertas para la fase SDD

- **Dónde exactamente se escribe `cost_cents_snapshot`** dentro del código
  actual del webhook de fulfillment (spec 007) — este documento fija el
  *momento* (junto al descuento de stock), no la línea de código exacta;
  se resuelve leyendo `src/app/api/webhooks/stripe/route.ts` en la fase
  SDD.
- **Volumen de "COGS parcial"**: si en la práctica muchos productos quedan
  sin costo por mucho tiempo, la utilidad bruta será sistemáticamente poco
  confiable — es una señal operativa (falta disciplina registrando compras
  en #1), no algo que este sub-proyecto deba resolver con un valor por
  defecto inventado.

## 9. Relación con el resto del roadmap

Con esto, los seis conceptos originales (Ingresos, Egresos, Impuestos,
Ganancias, Precio Unitario) quedan todos conectados sobre datos reales.
Solo falta el #6 (Contabilidad): el Registro de Ventas/Compras y los
exportables para el contador, que se apoyan en todo lo construido hasta
aquí sin necesitar un dato nuevo.
