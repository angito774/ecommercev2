# Sub-proyecto #4 — Impuestos (IGV y Renta RER)

**Fecha:** 2026-09-21
**Tipo:** documento de brainstorming (superpowers), previo a la fase SDD.
Continúa el roadmap de
[2026-09-21-modulo-finanzas-design.md](./2026-09-21-modulo-finanzas-design.md),
sub-proyecto #4. **Depende de #0, #2 y #3** — usa `electronic_documents`
(#0), `expenses.igv_cents` (#2) y "Ventas declarables" (#3).

## 1. Contexto verificado

- #3 ya define "Ventas declarables" como el monto **bruto** (con IGV
  incluido) de comprobantes emitidos, neto de notas de crédito/débito.
  Para el IGV débito fiscal hace falta el IGV **discriminado** de cada
  documento, que hoy no existe en `electronic_documents` (§4).
- #2 ya calcula `expenses.igv_cents` con la misma regla (18% asumido
  incluido) y distingue qué comprobantes son elegibles para crédito fiscal.
- Spec 017 (D-8, D-13) estableció el criterio del módulo: rango de fechas
  libre, sin cierre de período, sin gráficos — se mantiene aquí.

## 2. Decisiones tomadas con el usuario

| Decisión | Elegido |
|---|---|
| Régimen tributario de Renta | **RER** (Régimen Especial): 1.5% fijo de ingresos netos mensuales, **sin** ajuste anual. Confirmado explícitamente que **no** es Nuevo RUS — no hay restricción de no poder emitir factura, el diseño de #0 queda sin cambios |
| Alcance del saldo a favor de IGV | **Solo informativo, por rango de fechas.** Sin registro de "declaraciones" ni arrastre automático mes a mes — el contador hace ese seguimiento formal aparte, igual que el módulo hoy tampoco "cierra" meses (spec 017) |

## 3. Alcance

### Incluye

- **IGV por pagar** (o saldo a favor) del rango elegido: débito fiscal
  (ventas) menos crédito fiscal (compras elegibles de #2).
- **Renta RER**: 1.5% de los ingresos netos (base sin IGV) del rango,
  como estimado informativo — no reemplaza la declaración mensual real,
  que es por mes calendario exacto (§5).
- Ajuste a `electronic_documents` (de #0): dos columnas nuevas, `base_cents`
  e `igv_cents`, calculadas al emitir cada documento (§4) — necesarias para
  el IGV débito fiscal y para la base de Renta.
- Página `/admin/finance/taxes` ("Impuestos" en la nav de Finanzas): IGV a
  pagar/saldo a favor, Renta estimada, y el desglose de ambos lados
  (débito/crédito de IGV).

### No incluye (explícito)

- **Arrastre automático de saldo a favor entre períodos.** Decidido: solo
  informativo (§2).
- **Registro de declaraciones presentadas** ni ningún concepto de "mes
  cerrado".
- **Ajuste anual de Renta.** No aplica a RER (§2) — si el régimen cambiara
  en el futuro a uno con regularización anual (RMT, Régimen General), es
  un sub-proyecto propio, no una extensión de este.
- **Otros tributos** (ITAN, ESSALUD, ONP, retenciones de cuarta categoría
  por servicios de terceros, etc.). Fuera de alcance total.
- **Presentación de la declaración ante SUNAT** (PDT/formulario virtual).
  Este módulo calcula, no declara.

## 4. Modelo de datos

### Ajuste a `electronic_documents` (de #0)

| Columna nueva | Tipo | Nota |
|---|---|---|
| `base_cents` | `integer` nullable | Monto sin IGV. `null` en `comunicacion_baja` (no lleva importe) |
| `igv_cents` | `integer` nullable | `amount_cents − base_cents`. Mismo cálculo que #2: 18% asumido incluido |

A diferencia de `expenses.igv_cents` (#2, una aproximación para
conveniencia de captura), aquí **no es una aproximación**: la tienda
controla sus propios precios y el desglose base/IGV es lo que
efectivamente se envía a Nubefact al emitir — asume que todo el catálogo
tributa al 18% general (sin productos exonerados/inafectos). Si eso deja de
ser cierto, es una revisión de este cálculo, no un defecto oculto.

Sin tabla nueva para "declaraciones" — decisión de §2.

## 5. Reglas de cálculo (normativas)

**IGV débito fiscal** (ventas), en el rango, filtrando por `issued_at`:
```
igvDebito =
    sum(igv_cents WHERE kind IN ('boleta','factura') AND status = 'issued')
  − sum(igv_cents WHERE kind = 'nota_credito'        AND status = 'issued')
  + sum(igv_cents WHERE kind = 'nota_debito'          AND status = 'issued')
```

**IGV crédito fiscal** (compras), en el rango, de `expenses` (#2), filtrando
por `incurred_on`:
```
igvCredito = sum(igv_cents WHERE receipt_type IN ('factura','recibo_honorarios'))
```
Misma regla de elegibilidad que #2 §5 — sujeta a la misma verificación
pendiente contra normativa SUNAT vigente.

**IGV del período:**
```
neto = igvDebito − igvCredito
```
`neto ≥ 0` → **"IGV por pagar"**. `neto < 0` → **"Saldo a favor"**
(`|neto|`), con su propia etiqueta y color — nunca se muestra como "a
pagar" negativo (mismo criterio de accesibilidad que el resto del panel:
etiqueta + color + ícono, no solo el signo).

**Renta RER** (estimado), en el rango:
```
rentaEstimada = round(sum(base_cents de ventas declarables, issued) × 0.015)
```
Base **sin IGV** — "ingresos netos" para Renta excluye el IGV, que no es
ingreso de la empresa. Si el rango no coincide con un mes calendario
completo, la UI lo marca como estimado y aclara que la declaración real de
RER es mensual exacta.

## 6. Vista

- Página nueva `/admin/finance/taxes`. Dos bloques:
  - **IGV**: débito, crédito, neto (con la etiqueta correcta según signo),
    y el desglose débito/crédito como barras simples (mismo estilo que el
    resto del módulo, sin gráficos nuevos).
  - **Renta RER**: base de cálculo (ingresos netos del rango) y el 1.5%
    resultante, con la aclaración de que es un estimado por rango, no la
    declaración mensual oficial.
- Mismo filtro de rango de fechas que ya existe en `/admin/finance`, con el
  mes en curso como valor por defecto.

## 7. Permisos

Sin permisos nuevos: página de solo lectura detrás de `finance.read`. No
hay ninguna acción de escritura en este sub-proyecto (no se "presenta" nada,
§3).

## 8. Riesgos y decisiones abiertas para la fase SDD

- **Tasa de Renta RER vigente** — 1.5% es la tasa general aplicada hoy;
  se confirma contra la tabla vigente de SUNAT en la fase SDD antes de
  fijarla como constante, igual criterio que la elegibilidad de crédito
  fiscal en #2.
- **Cambio de régimen tributario en el futuro.** Este diseño asume RER de
  forma fija (constante, no configurable desde el panel). Si el régimen
  cambia, es una revisión explícita de este sub-proyecto, no algo que deba
  anticiparse con una abstracción "por si acaso" que hoy nadie necesita.
- **Productos exonerados o inafectos de IGV** — el cálculo asume que todo
  el catálogo tributa al 18% general (§4). Si en el futuro se vende algo
  exonerado, este cálculo sobreestimaría su IGV.

## 9. Relación con el resto del roadmap

Este sub-proyecto cierra el circuito de "cuánto se debe declarar". El #5
(Ganancias v2) reutiliza `igvDebito`/`igvCredito` indirectamente: la
utilidad neta real resta impuestos, no solo gastos operativos.
