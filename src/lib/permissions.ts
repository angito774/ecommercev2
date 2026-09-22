// Catálogo de autorización. Módulo deliberadamente puro: sin imports de Clerk, de
// Drizzle ni de `@/server`, para que el seed, un Route Handler o incluso un módulo
// de cliente puedan leerlo sin arrastrar el servidor al bundle. La resolución del
// set efectivo y `requirePermission()` viven en `src/lib/auth.ts`.

export const PERMISSIONS = [
  {
    code: 'categories.read',
    resource: 'categories',
    action: 'read',
    description: 'Ver el listado y el detalle de las categorías.',
  },
  {
    code: 'categories.create',
    resource: 'categories',
    action: 'create',
    description: 'Crear categorías nuevas.',
  },
  {
    code: 'categories.update',
    resource: 'categories',
    action: 'update',
    description: 'Editar categorías existentes.',
  },
  {
    code: 'categories.delete',
    resource: 'categories',
    action: 'delete',
    description: 'Desactivar categorías.',
  },
  {
    code: 'products.read',
    resource: 'products',
    action: 'read',
    description: 'Ver el listado y el detalle de los productos.',
  },
  {
    code: 'products.create',
    resource: 'products',
    action: 'create',
    description: 'Crear productos nuevos.',
  },
  {
    code: 'products.update',
    resource: 'products',
    action: 'update',
    description: 'Editar productos existentes.',
  },
  {
    code: 'products.delete',
    resource: 'products',
    action: 'delete',
    description: 'Desactivar productos.',
  },
  {
    code: 'orders.read',
    resource: 'orders',
    action: 'read',
    description: 'Ver el listado y el detalle de los pedidos.',
  },
  {
    code: 'orders.update_status',
    resource: 'orders',
    action: 'update_status',
    description: 'Cancelar pedidos que siguen pendientes de pago.',
  },
  {
    code: 'users.read',
    resource: 'users',
    action: 'read',
    description: 'Ver el listado de personas con acceso y sus roles.',
  },
  {
    code: 'users.invite',
    resource: 'users',
    action: 'invite',
    description: 'Invitar personas por correo electrónico.',
  },
  {
    code: 'users.update',
    resource: 'users',
    action: 'update',
    description: 'Activar o desactivar el acceso de una persona.',
  },
  {
    code: 'users.assign_roles',
    resource: 'users',
    action: 'assign_roles',
    description: 'Cambiar los roles asignados a una persona.',
  },
  {
    code: 'users.assign_elevated_roles',
    resource: 'users',
    action: 'assign_elevated_roles',
    description: 'Otorgar o revocar los roles de administración.',
  },
  {
    code: 'roles.read',
    resource: 'roles',
    action: 'read',
    description: 'Consultar la matriz de roles y permisos.',
  },
  {
    code: 'audit_logs.read',
    resource: 'audit_logs',
    action: 'read',
    description: 'Consultar la bitácora de auditoría.',
  },
  // Recurso propio y no `orders.read`: el dashboard mezcla pedidos, productos y
  // stock, así que exigir dos permisos dejaría indefinido qué se ve con uno solo
  // (spec 015, D-2). Lo que concede es el agregado, no las filas.
  {
    code: 'dashboard.read',
    resource: 'dashboard',
    action: 'read',
    description: 'Ver el dashboard de métricas del panel.',
  },
  // Recurso propio y no `products.read`: deja la puerta abierta a un rol de almacén
  // que reponga sin ver precios ni poder crear productos, sin tener que partir
  // `products.read` después (spec 016, D-1). Lo que concede es la vista de alertas;
  // corregir el stock sigue exigiendo `products.update`.
  {
    code: 'inventory.read',
    resource: 'inventory',
    action: 'read',
    description: 'Ver el control de inventario y las alertas de stock.',
  },
  // Lo reciben exactamente los tres roles que ya tienen `products.update`, es decir,
  // los que hoy ya pueden reescribir un stock a mano desde el formulario de producto
  // (spec 020, §5.5): el permiso no concede nada que esos roles no pudieran hacer ya
  // peor. `audit` queda fuera —ve los documentos con `inventory.read`, no registra
  // ninguno—.
  {
    code: 'inventory.move',
    resource: 'inventory',
    action: 'move',
    description: 'Registrar notas de ingreso y de salida de inventario.',
  },
  // Recurso propio y no `expenses.read`: lo que concede es el resultado del negocio
  // —ingresos menos gastos— y el listado de gastos es el detalle que hay detrás de
  // esa cifra, no un recurso que se consulte por separado (spec 017, D-2).
  {
    code: 'finance.read',
    resource: 'finance',
    action: 'read',
    description: 'Ver el resumen financiero y el registro de gastos.',
  },
  {
    code: 'expenses.create',
    resource: 'expenses',
    action: 'create',
    description: 'Registrar gastos operativos.',
  },
  {
    code: 'expenses.update',
    resource: 'expenses',
    action: 'update',
    description: 'Editar gastos operativos ya registrados.',
  },
  {
    code: 'expenses.delete',
    resource: 'expenses',
    action: 'delete',
    description: 'Eliminar gastos operativos.',
  },
  // El recurso es el dominio (`payroll`), no la ruta: por eso `/api/admin/employees`
  // se protege con un código `payroll.*` (spec 018, D-10). Dos códigos y no siete:
  // no existe el rol que administre personal sin ver sus pagos, y partir por
  // read/manage sí separa algo real —consultar la planilla no es tocarla— que es lo
  // que sostiene el `meta.canManage` de la UI.
  {
    code: 'payroll.read',
    resource: 'payroll',
    action: 'read',
    description: 'Ver el personal contratado y la bitácora de pagos de nómina.',
  },
  {
    code: 'payroll.manage',
    resource: 'payroll',
    action: 'manage',
    description: 'Dar de alta o de baja personal y registrar o anular pagos de nómina.',
  },
  // Permiso propio, y anotar lo que se pagó dentro de una compra **no** lo necesita
  // (spec 021, D-6): esa captura ya la cubre `inventory.move`, que `manager` tiene, y el
  // costo que registra queda respaldado por la factura de la nota. Fijar un costo
  // **fuera** de cualquier compra es afirmar un dato financiero sin comprobante detrás,
  // es irrepetible por diseño y solo lo pueden hacer `super_admin` y `admin`. Reutilizar
  // `finance.read` para escribirlo rompería la separación read/write del catálogo.
  {
    code: 'pricing.set_initial_cost',
    resource: 'pricing',
    action: 'set_initial_cost',
    description: 'Cargar el costo inicial de un producto que aún no tiene costo registrado.',
  },
  // Recurso propio (`invoicing`) y **no** `orders.update_status` (spec 022, §5.4): ese
  // permiso lo tiene `manager` y solo concede cancelar un pedido que sigue `pending`.
  // Emitir manda un documento fiscal a SUNAT con el RUC de la empresa, que es el mismo
  // criterio restrictivo del resto de finanzas (spec 017, D-3; spec 021, D-6): solo
  // `super_admin` y `admin`.
  //
  // `issue` y no `retry`: sin ningún proceso automático detrás, la primera emisión y la
  // décima son exactamente la misma acción de la misma persona sobre la misma fila, con
  // el mismo par serie-número (D-6, D-10). Un permiso llamado «reintentar» describiría
  // mal lo único que hace el sistema para emitir.
  //
  // **Ver** los documentos y su estado no estrena permiso: reutiliza `orders.read`, que
  // ya es exactamente el alcance «ver este pedido entero».
  {
    code: 'invoicing.issue',
    resource: 'invoicing',
    action: 'issue',
    description: 'Emitir ante SUNAT un comprobante electrónico pendiente o que falló.',
  },
  // **No basta `orders.update_status`** (spec 023, §5.1), y la diferencia no es de
  // grado: ese permiso lo tiene `manager` y lo único que concede es cancelar un
  // pedido que sigue `pending`, es decir, uno por el que nunca se cobró un céntimo.
  // Esto devuelve dinero real por Stripe y prepara un documento fiscal a nombre de
  // la empresa. Mismo criterio restrictivo que el resto de finanzas (spec 017, D-3)
  // y que `pricing.set_initial_cost` (spec 021, D-6): solo `super_admin` y `admin`.
  //
  // Va a los **mismos dos roles** que `invoicing.issue`, y es deliberado: quien
  // decide una devolución es quien después tiene que emitir su nota de crédito, y
  // separarlos crearía el estado «alguien devolvió dinero y nadie puede
  // documentarlo» (§10).
  //
  // **Ver** el estado del reembolso no estrena permiso: sigue siendo `orders.read`,
  // que ya es exactamente el alcance «ver este pedido entero».
  {
    code: 'orders.refund',
    resource: 'orders',
    action: 'refund',
    description:
      'Anular o devolver el importe de un pedido pagado y registrar su documento de corrección.',
  },
] as const;

// `PermissionDefinition` es la entrada del catálogo en código, simétrica con
// `RoleDefinition`. No confundir con el `Permission` de `permission.repository.ts`,
// que es la fila de Postgres.
export type PermissionDefinition = (typeof PERMISSIONS)[number];
export type PermissionCode = PermissionDefinition['code'];

export const ROLE_DEFINITIONS = [
  {
    slug: 'super_admin',
    name: 'Super administrador',
    description: 'Control total del panel. Es el único que puede nombrar administradores.',
    isElevated: true,
  },
  {
    slug: 'admin',
    name: 'Administrador',
    description:
      'Gestiona el catálogo, las personas y consulta la bitácora, pero no puede nombrar otros administradores.',
    isElevated: true,
  },
  {
    slug: 'manager',
    name: 'Encargado',
    description: 'Gestiona el catálogo y consulta quién tiene acceso, sin modificar accesos.',
    isElevated: false,
  },
  {
    slug: 'employee',
    name: 'Empleado',
    description:
      'Personal interno sin acceso al panel de administración. Usa la tienda como cualquier cliente.',
    isElevated: false,
  },
  {
    slug: 'customer',
    name: 'Cliente',
    description: 'Rol por defecto de quien compra en la tienda. Sin acceso al panel.',
    isElevated: false,
  },
  {
    slug: 'audit',
    name: 'Auditor',
    description: 'Solo lectura: consulta catálogo, personas, roles y la bitácora de auditoría.',
    isElevated: false,
  },
] as const;

export type RoleDefinition = (typeof ROLE_DEFINITIONS)[number];
export type RoleSlug = RoleDefinition['slug'];

// `employee` y `customer` tienen el conjunto vacío a propósito: solo super_admin,
// admin, manager y audit abren el panel (spec 002 §5.7 y §8).
export const ROLE_PERMISSION_MATRIX: Record<RoleSlug, readonly PermissionCode[]> = {
  super_admin: [
    'categories.read',
    'categories.create',
    'categories.update',
    'categories.delete',
    'products.read',
    'products.create',
    'products.update',
    'products.delete',
    'orders.read',
    'orders.update_status',
    'users.read',
    'users.invite',
    'users.update',
    'users.assign_roles',
    'users.assign_elevated_roles',
    'roles.read',
    'audit_logs.read',
    'dashboard.read',
    'inventory.read',
    'inventory.move',
    'finance.read',
    'expenses.create',
    'expenses.update',
    'expenses.delete',
    'payroll.read',
    'payroll.manage',
    'pricing.set_initial_cost',
    'invoicing.issue',
    'orders.refund',
  ],
  admin: [
    'categories.read',
    'categories.create',
    'categories.update',
    'categories.delete',
    'products.read',
    'products.create',
    'products.update',
    'products.delete',
    'orders.read',
    'orders.update_status',
    'users.read',
    'users.invite',
    'users.update',
    'users.assign_roles',
    'roles.read',
    'audit_logs.read',
    'dashboard.read',
    'inventory.read',
    'inventory.move',
    'finance.read',
    'expenses.create',
    'expenses.update',
    'expenses.delete',
    'payroll.read',
    'payroll.manage',
    'pricing.set_initial_cost',
    'invoicing.issue',
    'orders.refund',
  ],
  // `manager` y `audit` quedan fuera del módulo financiero a propósito (spec 017,
  // D-3): es el primer módulo con datos de resultado y no de operación. `manager`
  // opera catálogo y pedidos, `audit` revisa la bitácora —donde sí verá `expense.*`—,
  // y ninguno de los dos necesita el estado de resultados ni lo que se paga a
  // proveedores para su trabajo. El criterio es conceder por necesidad, no por
  // comodidad. Es la primera vez que un módulo del panel no se abre a los cuatro roles.
  manager: [
    'categories.read',
    'categories.create',
    'categories.update',
    'categories.delete',
    'products.read',
    'products.create',
    'products.update',
    'products.delete',
    'orders.read',
    // Cancela pedidos `pending`, y **sin `orders.refund`**: cancelar lo que nunca se
    // cobró y devolver dinero ya cobrado son dos acciones distintas, y por eso son dos
    // códigos distintos (spec 023, §5.1). `audit` no tiene ninguno de los dos.
    'orders.update_status',
    'users.read',
    'roles.read',
    'dashboard.read',
    'inventory.read',
    // Mueve stock por documento: `manager` ya podía reescribirlo desde
    // `products.update`, así que esto solo le da una forma trazable de hacerlo. Con este
    // permiso **anota** el costo unitario de una compra sin recibir ningún permiso nuevo
    // (spec 021, D-6) y sigue sin ver el margen que produce: `finance.read` y
    // `pricing.set_initial_cost` se le niegan, y las tres columnas juntas son la
    // separación de funciones del módulo de precio unitario.
    'inventory.move',
  ],
  employee: [],
  customer: [],
  audit: [
    'categories.read',
    'products.read',
    'orders.read',
    'users.read',
    'roles.read',
    'audit_logs.read',
    'dashboard.read',
    // Ve la lista de alertas y ninguna acción: sin `products.update` la tabla no
    // pinta la columna de acciones (spec 016, AC13).
    'inventory.read',
    // Sin `payroll.read`, y es deliberado pese a que `audit` lee todo lo demás
    // (spec 018, D-4). El salario es la cifra más sensible del panel y este rol rompe
    // aquí la regla implícita de «audit lo ve todo». La consecuencia está acoplada a
    // D-8: `audit` y `manager` sí tienen `audit_logs.read`, y la vista de bitácora
    // renderiza `changes` y `metadata` íntegros, así que si alguna mutación de nómina
    // escribiera un importe en el log, `/admin/audit-logs` se convertiría en el
    // listado de sueldos de la empresa para roles a los que se les acaba de negar.
    // Restaurar «audit lo lee todo» sin pensar reabre esa puerta trasera.
  ],
};

// Un usuario sin filas en `user_roles` se trata como `customer` (docs/SETUP.md
// §5.1, regla dura 3). El default es implícito y no necesita constante: la fila de
// `customer` en la matriz está vacía, así que "sin rol" y "rol customer" resuelven
// el mismo conjunto vacío. Si algún día `customer` otorga algo, ese default vuelve
// a ser una consulta explícita dentro de `getEffectivePermissions()`.

export function can(granted: ReadonlySet<PermissionCode>, code: PermissionCode): boolean {
  return granted.has(code);
}

const PERMISSION_CODES = new Set<string>(PERMISSIONS.map((permission) => permission.code));
const ROLE_SLUGS = new Set<string>(ROLE_DEFINITIONS.map((role) => role.slug));

// Postgres devuelve `code` y `slug` como texto libre. Estos guardas estrechan el
// tipo sin castear y, de paso, descartan filas que quedaron en la base tras retirar
// un permiso o un rol del catálogo: lo que no está en el código no otorga nada.
export function isPermissionCode(value: string): value is PermissionCode {
  return PERMISSION_CODES.has(value);
}

export function isRoleSlug(value: string): value is RoleSlug {
  return ROLE_SLUGS.has(value);
}

// `permission` es el permiso bajo el que cae la acción rechazada, no siempre el que
// faltaba: las reglas de negocio que devuelven 403 con el permiso concedido —el
// autobloqueo del actor, o tocar un rol elevado sin la elevación— lo usan para
// dejar constancia del ámbito y pasan su propio mensaje, porque "no tienes permiso"
// sería mentira y dejaría al usuario sin saber qué hizo mal.
//
// `null` = el rechazo no cuelga de ningún permiso: la cuenta está desactivada y no
// habría código que concederle. Es el caso de las operaciones de cliente sin RBAC
// detrás (`requireActiveUser()`), no un permiso desconocido.
export class ForbiddenError extends Error {
  readonly permission: PermissionCode | null;

  constructor(
    permission: PermissionCode | null,
    message = 'No tienes permiso para realizar esta acción.',
  ) {
    super(message);
    this.name = 'ForbiddenError';
    this.permission = permission;
  }
}
