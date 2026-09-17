// Barrel de tablas. Cada spec que introduzca una tabla la exporta desde aquí;
// drizzle-kit lee este directorio completo para generar migraciones.
export { auditLogs, auditSeverity } from './audit-log';
export { categories } from './category';
export { expenseCategory, expenses } from './expense';
export { orderItems } from './order-item';
export { orders, orderStatus } from './order';
export { paymentMethods } from './payment-method';
export { permissions } from './permission';
export { products } from './product';
export { rolePermissions } from './role-permission';
export { roles } from './role';
export { userRoles } from './user-role';
export { USER_TEXT_LENGTHS, users } from './user';
