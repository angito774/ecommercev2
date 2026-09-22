# Módulo de Finanzas — roadmap y diseño de arranque (Precio Unitario)

**Fecha:** 2026-09-21
**Tipo:** documento de brainstorming (superpowers), previo a la fase SDD del
proyecto. No es un spec de `docs/specs/` y no lo produjo el agente `spec`: es
el insumo para esa fase, redactado a petición explícita del usuario sin pasar
por `orchestrator`/`spec`/`developer`/`reviewer`.

## 1. Punto de partida

El usuario pidió aterrizar la idea de un módulo de Finanzas con seis
secciones: Ingresos, Egresos, Impuestos, Ganancias, Contabilidad y Precio
Unitario (margen por producto). Verificado contra el repo antes de preguntar
nada:

- **Ya existe** `docs/specs/017-admin-finance.md` (`status: done`), que cubre
  una primera versión de **Ingresos** (ventas `paid`), **Egresos** (tabla
  `expenses`, CRUD manual, 8 categorías) y **Ganancias** (`neto = ingresos −
  gastos`, con el propio spec advirtiendo que **no** es utilidad contable
  porque falta el costo de mercadería vendida). El usuario confirmó en esta
  sesión que ese spec **fue una prueba** y autoriza rehacerlo o descartarlo
  por completo si el diseño del módulo completo lo pide.
- **No existe** ninguna columna de costo en `products` ni en ningún otro
  lado del esquema — verificado con `grep -rn "cost" src/server/db/schema/`
  sin resultados.
- **No existe** facturación electrónica SUNAT: el comprobante que recibe el
  cliente es el recibo genérico de Stripe (`Charge.receipt_url`, spec `008`,
  D-8), sin RUC de la empresa ni integración con un PSE/OSE. El propio spec
  `017` excluye explícitamente IGV, retenciones y cualquier cálculo
  tributario.
- El módulo de inventario (spec `020`) ya tiene notas de ingreso/salida con
  seis tipos de transacción (`salida_venta`, `salida_cambio`,
  `salida_prestamo`, `ingreso_devolucion`, `ingreso_compra`,
  `ingreso_cambio`), pero ninguna línea de movimiento registra costo
  unitario.

## 2. Por qué esto no es un módulo, es un programa

El usuario confirmó que quiere **cumplimiento tributario formal ante SUNAT**,
no solo reportes internos. Eso, combinado con la ausencia de facturación
electrónica, hace que "Impuestos" y "Contabilidad" no puedan construirse
sobre los datos actuales del sistema: el IGV declarable sale de comprobantes
electrónicos reales, no de `orders`. Se decidió (con el usuario) descomponer
en sub-proyectos independientes, cada uno con su propio spec SDD futuro:

| # | Sub-proyecto | Depende de | Qué resuelve |
|---|---|---|---|
| **0** | **Facturación electrónica** | — | Integración con un PSE/OSE (ej. Nubefact), RUC de la empresa, captura de RUC/DNI del cliente en checkout, series/correlativos, PDF+XML+CDR por venta. Prerrequisito real de todo lo demás. |
| **1** | **Precio Unitario** (costo y margen por producto) | — | Costo promedio ponderado por producto, base para la utilidad bruta real. Diseñado en detalle en este documento (§3). |
| **2** | **Egresos v2** | — | Añadir RUC del proveedor + n.º de comprobante a `expenses`, para crédito fiscal (IGV de compras). |
| **3** | **Ingresos v2** | #0 | Conectar cada venta a su comprobante electrónico real. |
| **4** | **Impuestos** | #0, #2, #3 | IGV por pagar (ventas − compras) y pagos a cuenta de Renta, sobre datos reales. |
| **5** | **Ganancias v2** | #1, #2, #4, payroll (018) | Utilidad bruta, operativa y neta reales, reemplazando el "neto" simplificado del spec 017. |
| **6** | **Contabilidad** | #0–#5 | Registro de Ventas, Registro de Compras, exportables tipo PLE para el contador. |

El usuario eligió empezar por **#1 (Precio Unitario)** porque no depende de
facturación electrónica y da valor inmediato (saber qué productos dejan
margen real). El resto de sub-proyectos **no** se ha brainstormeado a este
nivel de detalle todavía — quedan como roadmap, a retomar uno a la vez.

**Actualización:** el sub-proyecto #0 (Facturación electrónica) ya tiene su
propio diseño detallado, aprobado:
[2026-09-21-facturacion-electronica-design.md](./2026-09-21-facturacion-electronica-design.md).
Incluye boleta/factura, nota de crédito/débito, comunicación de baja y
reembolso integrado con Stripe.

## 3. Diseño — Sub-proyecto #1: Precio Unitario

### 3.1 Modelo de datos

- `products.average_cost_cents` (`integer`, nullable): costo promedio
  ponderado vigente. `null` = "sin costo registrado", nunca `0` inventado.
- Las líneas de `stock_movements` ganan un costo unitario, exigido **solo**
  cuando el documento es de tipo `ingreso_compra`; en `ingreso_devolucion` e
  `ingreso_cambio` queda vacío (no es una compra nueva a otro precio).
- Sin tabla nueva para el costo inicial manual: es el mismo campo
  `average_cost_cents`, con la regla de que solo se puede escribir a mano
  **mientras esté en `null`**. Una vez tiene valor, todo cambio futuro viene
  únicamente de una nota de `ingreso_compra`.

### 3.2 Reglas de cálculo

- **Promedio ponderado**, recalculado en la misma transacción que crea la
  nota de `ingreso_compra`:

  ```
  nuevo_promedio = (stock_actual × costo_actual + cantidad_ingresada × costo_unitario)
                    / (stock_actual + cantidad_ingresada)
  ```

- Solo `ingreso_compra` mueve el promedio. Ningún tipo de `salida_*` lo toca
  (el promedio es una propiedad del inventario que queda, no de lo que sale).
- **Margen** = `(precio − costo) / precio` (margen sobre precio de venta, no
  markup sobre costo — decisión explícita del usuario). Sin costo registrado
  → margen vacío, nunca `0%`. Margen negativo (vendiendo bajo costo) se marca
  con color **+ ícono + texto**, no solo color (mismo criterio de
  accesibilidad que el resto del panel, spec 016/017).

### 3.3 Permisos

- Lectura de la pantalla: reutiliza `finance.read` (ya existe; solo
  `super_admin`/`admin`).
- Registrar el costo dentro de una nota de `ingreso_compra`: **sin permiso
  nuevo** — ya lo cubre `inventory.move`, el mismo con el que hoy se crean
  notas de ingreso. Separación de funciones deliberada: un encargado de
  almacén anota cuánto se pagó sin necesitar ver el margen resultante.
- Cargar el costo inicial manual (una sola vez, fuera de una compra): permiso
  nuevo `pricing.set_initial_cost`, solo `super_admin`/`admin` (mismo
  criterio que el resto de finanzas, spec 017 D-3).

### 3.4 Vista

- Página nueva `/admin/finance/pricing` ("Precio Unitario" en la nav de
  Finanzas), protegida con `finance.read`.
- Tabla: Producto · Precio de venta · Costo promedio (o "Sin costo
  registrado") · Margen S/ · Margen % · acción "Establecer costo inicial"
  (visible solo si no hay costo aún y el usuario tiene el permiso).
- Sin gráficos ni exportación, mismo criterio que el resto del módulo
  financiero (spec 017, D-13).

### 3.5 Explícitamente fuera de este sub-proyecto

- FIFO o costeo por lote — se eligió promedio ponderado.
- Margen **realizado** histórico por venta: necesita congelar el costo en
  `order_items` (hoy solo congela `price_cents_snapshot`). Es tarea del
  sub-proyecto #5 (Ganancias v2), no de este.
- Alertas o umbrales de margen bajo.
- Si el costo registrado incluye IGV o no — queda pendiente para resolver en
  la fase SDD de este sub-proyecto.

## 4. Estado y siguiente paso

Diseño de §3 **aprobado por el usuario** en esta sesión de brainstorming.
Los sub-proyectos #0 y #2–#6 quedan como roadmap (§2), sin brainstorming
detallado todavía.

**Siguiente paso:** cuando el usuario decida pasar a la fase SDD para el
sub-proyecto #1, se invoca al agente `orchestrator` con este documento como
contexto — no `writing-plans`, porque el usuario pidió expresamente detenerse
antes de la fase de implementación/planning hasta esa aprobación explícita.
