# Sub-proyecto #6 — Contabilidad (Registro de Ventas y Compras)

**Fecha:** 2026-09-21
**Tipo:** documento de brainstorming (superpowers), previo a la fase SDD.
Cierra el roadmap de
[2026-09-21-modulo-finanzas-design.md](./2026-09-21-modulo-finanzas-design.md),
sub-proyecto #6 — el último. **Depende de #0** (`electronic_documents`) y
**#2** (`expenses` con datos de comprobante). No necesita ningún dato
nuevo: es la primera vista del módulo que no agrega columnas a nada.

## 1. Contexto verificado

- SUNAT viene migrando del PLE clásico (TXT pipe-delimited, generado por el
  contribuyente) al **SIRE** (Sistema Integrado de Registros Electrónicos),
  que arma el Registro de Ventas y Compras **automáticamente** a partir de
  los comprobantes que el OSE (Nubefact, #0) ya reportó a SUNAT en el
  momento de emitirlos. El contribuyente revisa y valida la propuesta de
  SUNAT, no la genera desde cero.
- Spec 017 (D-13) excluyó explícitamente exportación a CSV/PDF del módulo
  base. Este sub-proyecto es, a propósito, el que la agrega — no es una
  contradicción, es el alcance que 017 dejó reservado para más adelante.

## 2. Decisión tomada con el usuario

**Exportable en Excel/CSV legible, no el formato PLE exacto.** Con SIRE
armando el registro oficial desde los datos que ya reporta Nubefact, un
archivo TXT con la estructura rígida de SUNAT no aporta sobre lo que SUNAT
ya arma solo — lo que sí aporta valor es una tabla clara para que el
contador revise, cruce y concilie contra el SIRE.

## 3. Alcance

### Incluye

- **Registro de Ventas**: todos los `electronic_documents` con
  `status = 'issued'` (boleta, factura, nota de crédito, nota de débito)
  del rango elegido, con su documento relacionado cuando aplica (§5).
- **Registro de Compras**: todos los `expenses` con `receipt_type` no nulo
  del rango elegido — los gastos sin comprobante **no** entran aquí, no son
  un documento fiscal de compra (siguen viéndose en Egresos, #2, como
  siempre).
- Exportación a **CSV** (no `.xlsx`): abre directo en Excel/Sheets, cero
  dependencias nuevas en el proyecto, y es texto plano — más fácil de
  auditar que un binario. Respeta el rango de fechas activo.
- Página `/admin/finance/accounting` ("Contabilidad" en la nav de
  Finanzas), dos pestañas: Ventas y Compras, cada una con su tabla y su
  botón "Exportar CSV".

### No incluye (explícito)

- **Formato PLE exacto** (decisión §2).
- **Libro Diario, Libro Mayor ni plan de cuentas.** El roadmap original
  (§2 del documento raíz) solo pidió Registro de Ventas/Compras — un
  sistema de partida doble completo es un sub-proyecto en sí mismo, no una
  extensión de este, y nadie lo ha pedido todavía.
- **Envío o integración directa con el SIRE de SUNAT.** Este módulo exporta
  para que una persona lo revise; no se conecta a ninguna API de SUNAT.
- **Conciliación automática** entre lo que este módulo calcula y lo que el
  SIRE de SUNAT termine mostrando — es trabajo del contador, esta pantalla
  le da los datos para hacerlo más rápido, no lo reemplaza.

## 4. Modelo de datos

Ninguno nuevo. Es una vista de lectura sobre `electronic_documents` (#0) y
`expenses` (#2), tal como quedaron diseñados.

## 5. Reglas de cálculo / composición

**Registro de Ventas** — una fila por `electronic_documents` `issued` en el
rango (filtrando por `issued_at`, igual criterio que #3/#4), columnas:
fecha de emisión, tipo de documento, serie-número, tipo y número de
documento del comprador (`orders.buyer_document_type/number`), razón social
si aplica, base, IGV, total, y — si es `nota_credito`/`nota_debito` —
serie-número del documento que corrige (`related_document_id`).

**Registro de Compras** — una fila por `expenses` con comprobante en el
rango (filtrando por `incurred_on`), columnas: fecha, RUC proveedor, razón
social proveedor, tipo de comprobante, serie-número, base, IGV, total, y si
es elegible para crédito fiscal (misma regla de #2/#4, con su misma
verificación pendiente contra normativa vigente).

Ninguna de las dos tablas inventa un correlativo propio: el orden es
cronológico y las columnas ya identifican cada documento por su serie y
número real, que es lo que un contador usa para cruzar contra el SIRE.

## 6. Vista

- `/admin/finance/accounting`, dos pestañas (Ventas / Compras), cada una
  con `DataTable` paginada (mismo patrón del resto del panel) y "Exportar
  CSV" que respeta el filtro de fecha activo.
- Mismo filtro de rango de fechas que el resto del módulo, mes en curso por
  defecto.
- Sin gráficos (consistente con todo el módulo, D-13 de spec 017 — la
  única pieza que sí cambia respecto a 017 es la exportación, que 017 dejó
  reservada a propósito para este momento).

## 7. Permisos

Sin permisos nuevos: reutiliza `finance.read` — es una vista de lectura y
exportación sobre datos ya protegidos por sus propios módulos (#0, #2).

## 8. Riesgos y decisiones abiertas para la fase SDD

- **Codificación del CSV** (UTF-8 con BOM, para que Excel en Windows no
  rompa las tildes/ñ) — detalle de implementación, no se fija aquí.
- **Si el contador de todos modos termina necesitando el PLE exacto** más
  adelante (por ejemplo si SUNAT retrasa la migración a SIRE para el
  régimen de esta empresa) — se revisita este sub-proyecto puntualmente,
  no se construye "por si acaso" hoy.

## 9. Cierre del roadmap

Con este sub-proyecto, los seis conceptos que pediste al inicio
(Ingresos, Egresos, Impuestos, Ganancias, Contabilidad, Precio Unitario)
tienen diseño aprobado: #1 Precio Unitario, #0 Facturación electrónica,
#2 Egresos v2, #3 Ingresos v2, #4 Impuestos, #5 Ganancias v2, #6
Contabilidad. El orden de construcción real en la fase SDD no tiene que
seguir el orden en que se diseñaron — solo respetar las dependencias ya
anotadas en cada documento (§ "Relación con el resto del roadmap" de cada
uno).
