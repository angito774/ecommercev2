import type { AuditLogQueryParams } from './schemas/audit-log.schema';
import type { AuditSeverity } from './types/audit-log.types';

export const DEFAULT_PAGE_SIZE = 20;

// Índice de presentación de las acciones que hoy escriben los servicios
// (`user-access.service.ts`, `user-sync.service.ts`, los handlers de categorías y
// el seed). No es una fuente de verdad: quien decide qué se audita es quien llama a
// `logAudit`, y una acción nueva que no pase por aquí se muestra con su código
// crudo en vez de romper la vista. Por eso el desplegable se arma desde esta lista
// pero el schema de consulta acepta cualquier texto acotado.
export const AUDIT_ACTIONS = [
  { code: 'category.created', label: 'Categoría creada', entityType: 'category' },
  { code: 'category.updated', label: 'Categoría editada', entityType: 'category' },
  { code: 'category.deactivated', label: 'Categoría desactivada', entityType: 'category' },
  { code: 'product.created', label: 'Producto creado', entityType: 'product' },
  { code: 'product.updated', label: 'Producto editado', entityType: 'product' },
  { code: 'product.deactivated', label: 'Producto desactivado', entityType: 'product' },
  { code: 'user.invited', label: 'Persona invitada', entityType: 'user' },
  { code: 'user.created', label: 'Cuenta creada', entityType: 'user' },
  { code: 'user.roles_changed', label: 'Roles cambiados', entityType: 'user' },
  { code: 'user.activated', label: 'Acceso devuelto', entityType: 'user' },
  { code: 'user.deactivated', label: 'Acceso retirado', entityType: 'user' },
  // `order.paid`, `order.payment_failed`, `order.canceled` y `order.oversold` los
  // escribe el webhook de Stripe desde el spec 007 con `actor_id` nulo;
  // `order.status_changed` es la cancelación desde el panel (spec 014).
  { code: 'order.paid', label: 'Pago confirmado', entityType: 'order' },
  { code: 'order.payment_failed', label: 'Pago fallido', entityType: 'order' },
  { code: 'order.canceled', label: 'Pedido cancelado', entityType: 'order' },
  { code: 'order.status_changed', label: 'Estado del pedido cambiado', entityType: 'order' },
  { code: 'order.oversold', label: 'Stock negativo tras la venta', entityType: 'order' },
  // Las cinco del módulo de nómina (spec 018). Ninguna lleva importes en `changes` ni
  // en `metadata`: esta vista las renderiza íntegras y la leen roles sin `payroll.read`
  // (spec 018, D-8).
  { code: 'employee.created', label: 'Empleado dado de alta', entityType: 'employee' },
  { code: 'employee.updated', label: 'Empleado editado', entityType: 'employee' },
  { code: 'employee.deactivated', label: 'Empleado dado de baja', entityType: 'employee' },
  {
    code: 'payroll_payment.registered',
    label: 'Pago de nómina registrado',
    entityType: 'payroll_payment',
  },
  {
    code: 'payroll_payment.voided',
    label: 'Pago de nómina anulado',
    entityType: 'payroll_payment',
  },
  // La única del módulo de movimientos de inventario (spec 020). El detalle de lo que
  // se movió vive en `stock_movements`, que es permanente; el log solo dice qué
  // documento se registró (spec 020, D-19).
  {
    code: 'inventory_document.created',
    label: 'Documento de inventario registrado',
    entityType: 'inventory_document',
  },
] as const;

const ACTION_LABELS = new Map<string, string>(
  AUDIT_ACTIONS.map((action) => [action.code, action.label]),
);

export function auditActionLabel(code: string): string {
  return ACTION_LABELS.get(code) ?? code;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: 'Persona',
  category: 'Categoría',
  product: 'Producto',
  order: 'Pedido',
  role: 'Rol',
  // «Empleado» y no «Persona»: `user` ya ocupa ese significado y las dos tablas son
  // deliberadamente independientes (spec 018, D-1).
  employee: 'Empleado',
  payroll_payment: 'Pago de nómina',
  inventory_document: 'Documento de inventario',
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: 'Informativo',
  warning: 'Relevante',
  error: 'Error',
};

// `all` es el valor del filtro, no de la columna: el `Select` de shadcn no admite
// un item con valor vacío.
export const AUDIT_SEVERITY_OPTIONS = [
  { value: 'all', label: 'Todas las severidades' },
  { value: 'info', label: AUDIT_SEVERITY_LABELS.info },
  { value: 'warning', label: AUDIT_SEVERITY_LABELS.warning },
  { value: 'error', label: AUDIT_SEVERITY_LABELS.error },
] as const satisfies ReadonlyArray<{ value: AuditLogQueryParams['severity']; label: string }>;

export const AUDIT_ENTITY_OPTIONS = [
  { value: 'all', label: 'Todo' },
  { value: 'user', label: 'Personas' },
  { value: 'category', label: 'Categorías' },
  { value: 'product', label: 'Productos' },
  { value: 'order', label: 'Pedidos' },
  { value: 'employee', label: 'Personal' },
  { value: 'payroll_payment', label: 'Pagos de nómina' },
  { value: 'inventory_document', label: 'Documentos de inventario' },
] as const;

export const AUDIT_ACTION_OPTIONS = [
  { value: 'all', label: 'Todas las acciones' },
  ...AUDIT_ACTIONS.map((action) => ({ value: action.code, label: action.label })),
] as const;

// Etiquetas de los campos que aparecen en el `changes` de la bitácora. Cae al
// nombre crudo si un servicio audita un campo nuevo.
const FIELD_LABELS: Record<string, string> = {
  sku: 'SKU',
  priceCents: 'Precio (céntimos)',
  stock: 'Stock',
  specs: 'Características',
  categoryId: 'Categoría',
  imageUrl: 'Imagen',
  name: 'Nombre',
  slug: 'Identificador',
  description: 'Descripción',
  isActive: 'Acceso',
  roleSlugs: 'Roles',
  email: 'Correo',
  firstName: 'Nombre',
  lastName: 'Apellido',
  status: 'Estado',
  employeeCode: 'Código de planilla',
  jobTitle: 'Cargo',
  hiredAt: 'Fecha de ingreso',
  period: 'Periodo',
  paidAt: 'Fecha de pago',
  // La bitácora dice que el salario cambió, no de cuánto a cuánto: la cifra vive en la
  // tabla del dominio, protegida por `payroll.read` (spec 018, D-8).
  salaryChanged: 'Salario modificado',
  // Los cuatro campos del `after` de `inventory_document.created` (spec 020, D-19).
  // `itemCount` y no las cantidades por producto: ese detalle es de `stock_movements`.
  docNumber: 'Número de documento',
  transaccionId: 'Tipo de transacción',
  docDate: 'Fecha del documento',
  itemCount: 'Líneas',
};

export function auditFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (params: AuditLogQueryParams) => [...auditLogKeys.lists(), params] as const,
};
