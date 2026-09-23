// Barrel de tablas. Cada spec que introduzca una tabla la exporta desde aquí;
// drizzle-kit lee este directorio completo para generar migraciones.
export { auditLogs, auditSeverity } from './audit-log';
export { categories } from './category';
export { documentSeries, documentSeriesKey } from './document-series';
export {
  electronicDocumentKind,
  electronicDocuments,
  electronicDocumentStatus,
} from './electronic-document';
export { employees } from './employee';
export { expenseCategory, expenses, purchaseReceiptType } from './expense';
export { inventoryDocuments } from './inventory-document';
export { orderItems } from './order-item';
export { buyerDocumentType, orders, orderStatus } from './order';
export { payrollPayments } from './payroll-payment';
export { paymentMethods } from './payment-method';
export { permissions } from './permission';
export { products } from './product';
export { rolePermissions } from './role-permission';
export { roles } from './role';
export { stockMovements } from './stock-movement';
export { tipoTransaccion, transacciones } from './transaccion';
export { userRoles } from './user-role';
export { USER_TEXT_LENGTHS, users } from './user';
