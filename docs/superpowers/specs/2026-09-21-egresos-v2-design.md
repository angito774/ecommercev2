# Sub-proyecto #2 — Egresos v2 (crédito fiscal de compras)

**Fecha:** 2026-09-21
**Tipo:** documento de brainstorming (superpowers), previo a la fase SDD.
Continúa el roadmap de
[2026-09-21-modulo-finanzas-design.md](./2026-09-21-modulo-finanzas-design.md),
sub-proyecto #2.

## 1. Contexto verificado

- `expenses` (spec `017-admin-finance.md`, `status: done`) hoy es: `concept`
  (texto libre), `amount_cents`, `category` (enum de 8 valores), `incurred_on`,
  `created_by_id`. **Sin** proveedor, sin RUC, sin dato de comprobante, sin
  IGV — verificado contra `src/server/db/schema/expense.ts`.
- El propio spec 017 excluyó explícitamente "proveedores como entidad" y
  cualquier cálculo tributario (§3, "no incluye").
- El sub-proyecto #0 (facturación electrónica) ya diseñó una validación
  offline de RUC por dígito verificador (módulo 11) para el comprador — se
  reutiliza aquí para el RUC del proveedor, sin reinventarla.

## 2. Decisiones tomadas con el usuario

| Decisión | Elegido |
|---|---|
| Catálogo de proveedores | **No.** RUC/razón social en texto libre por gasto, mismo criterio YAGNI que el resto del proyecto ("se extrae a la tercera repetición") |
| Gastos sin comprobante formal | **Siguen existiendo tal cual hoy.** El dato de RUC/comprobante/IGV es opcional, solo se pide cuando el gasto sí tiene factura |
| Cálculo del IGV | **Automático al 18%**, asumido incluido en `amount_cents`. No se teclea aparte |

## 3. Alcance

### Incluye

- Campos nuevos en `expenses` para el comprobante del proveedor (RUC, razón
  social, tipo de comprobante, serie, número), todos opcionales.
- Cálculo automático del IGV contenido en el gasto (18%) cuando hay
  comprobante, guardado como `igv_cents` para no recalcularlo en cada
  lectura.
- Distinción de **elegibilidad para crédito fiscal** según el tipo de
  comprobante: no todo comprobante con IGV lo otorga (§5).
- Card nueva "IGV de compras" en `/admin/finance`, junto a las que ya
  existen (ingresos, gastos, neto, margen) — adelanto de lo que el
  sub-proyecto #4 (Impuestos) restará contra el IGV de ventas.
- Validación offline del RUC del proveedor (dígito verificador), reutilizada
  de #0.

### No incluye (explícito)

- **Catálogo de proveedores.** Decidido: texto libre (§2).
- **Validación en línea del RUC** contra el padrón de SUNAT.
- **Adjuntar el PDF o foto del comprobante.** Sigue fuera, como en spec 017.
- **El cálculo completo de "IGV por pagar".** Eso es el sub-proyecto #4;
  este solo aporta el lado de compras.
- **Retroactividad.** Los gastos ya registrados quedan con
  `receipt_type = null` (sin comprobante) — no se puede inventar si tuvieron
  factura o no.

## 4. Modelo de datos (propuesta para el spec)

### `expenses` — columnas nuevas

| Columna | Tipo | Nota |
|---|---|---|
| `receipt_type` | enum `'factura' \| 'boleta' \| 'recibo_honorarios' \| 'otro'`, nullable | `null` = sin comprobante (mayoría de casos hoy) |
| `supplier_ruc` | `varchar(11)` nullable | Exigido cuando `receipt_type` no es `null`; validado por dígito verificador |
| `supplier_name` | `varchar(160)` nullable | Texto libre, como `concept` |
| `receipt_series` | `varchar(4)` nullable | |
| `receipt_number` | `varchar(20)` nullable | |
| `igv_cents` | `integer` nullable | Calculado por el servidor al guardar, **no** lo teclea el usuario |

## 5. Reglas de cálculo (normativas)

**IGV contenido:**
```
igv_cents = amount_cents − round(amount_cents / 1.18)
```
Solo se calcula cuando `receipt_type` no es `null`. Es una aproximación
consciente: asume que todo el monto incluye 18 % de IGV, lo cual no es
exacto para bienes o servicios exonerados/inafectos. Es la decisión
explícita del usuario (§2), documentada como limitación conocida, no un
defecto a corregir.

**Elegibilidad para crédito fiscal** — regla general de SUNAT, a **confirmar
contra la normativa vigente en la fase SDD** antes de implementar el filtro:
solo `'factura'` y `'recibo_honorarios'` otorgan crédito fiscal al
comprador con RUC; `'boleta'` normalmente no (SUNAT ha tenido variaciones
puntuales sobre crédito fiscal parcial desde boletas electrónicas — no se
asume aquí, se verifica antes de sumar). `'otro'` no otorga crédito fiscal.
La card "IGV de compras" suma solo `igv_cents` de los gastos elegibles;
los demás se calculan igual (transparencia) pero se muestran aparte.

## 6. Vista

- El formulario de gasto existente gana un interruptor "¿Tiene
  comprobante?"; al activarlo aparecen tipo de comprobante, RUC y razón
  social del proveedor, serie y número. El IGV no se teclea: se muestra
  calculado, de solo lectura, tras guardar.
- La tabla de gastos gana una columna/indicador de IGV cuando corresponde.
- `/admin/finance` gana la card "IGV de compras" del período, con el mismo
  filtro de rango de fechas que ya existe.

## 7. Permisos

Sin permisos nuevos: reutiliza `expenses.create`/`update`/`delete` para
escritura y `finance.read` para lectura — es una extensión de un recurso ya
protegido, no un recurso nuevo.

## 8. Riesgos y decisiones abiertas para la fase SDD

- **Regla exacta de elegibilidad de crédito fiscal por tipo de comprobante**
  (§5) — confirmar contra normativa SUNAT vigente antes de implementar.
- **Gastos con tasas de IGV distintas al 18 % o exonerados** — el cálculo
  automático los trata igual que cualquier otro; si en la práctica esto
  distorsiona mucho el número, la alternativa (IGV tecleado a mano) queda
  documentada en este mismo documento como la que se descartó, no hay que
  redebatirla, solo reconsiderarla si el dato demuestra que hace falta.
- **Migración**: nueva migración Drizzle con el enum y las cinco columnas;
  sin dato retroactivo (§3).

## 9. Relación con el resto del roadmap

Este sub-proyecto alimenta directamente al #4 (Impuestos), que restará
`igv_cents` elegible de este módulo contra el IGV de ventas que produce el
#0 (Facturación electrónica) + #3 (Ingresos v2). No depende de #0 para
construirse — es independiente y se puede hacer en cualquier momento.
