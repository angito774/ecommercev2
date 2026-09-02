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
  { code: 'user.invited', label: 'Persona invitada', entityType: 'user' },
  { code: 'user.created', label: 'Cuenta creada', entityType: 'user' },
  { code: 'user.roles_changed', label: 'Roles cambiados', entityType: 'user' },
  { code: 'user.activated', label: 'Acceso devuelto', entityType: 'user' },
  { code: 'user.deactivated', label: 'Acceso retirado', entityType: 'user' },
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
  role: 'Rol',
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
] as const;

export const AUDIT_ACTION_OPTIONS = [
  { value: 'all', label: 'Todas las acciones' },
  ...AUDIT_ACTIONS.map((action) => ({ value: action.code, label: action.label })),
] as const;

// Etiquetas de los campos que aparecen en el `changes` de la bitácora. Cae al
// nombre crudo si un servicio audita un campo nuevo.
const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  slug: 'Identificador',
  description: 'Descripción',
  isActive: 'Acceso',
  roleSlugs: 'Roles',
  email: 'Correo',
  firstName: 'Nombre',
  lastName: 'Apellido',
};

export function auditFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (params: AuditLogQueryParams) => [...auditLogKeys.lists(), params] as const,
};
