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
  ],
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
    'orders.update_status',
    'users.read',
    'roles.read',
    'dashboard.read',
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
