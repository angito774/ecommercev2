import { logAudit, type AuditContext } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  duplicatePeriodMessage,
  EMPLOYEE_NOT_FOUND_MESSAGE,
  inactiveEmployeeMessage,
  paidBeforeHiredMessage,
  PAYMENT_NOT_FOUND_MESSAGE,
} from '@/modules/payroll/constants';
import type { CreatePayrollPaymentValues } from '@/modules/payroll/schemas/payroll.schema';
import type { PayrollPaymentRow } from '@/modules/payroll/types/payroll.types';
import { db } from '@/server/db';
import type { users } from '@/server/db/schema';
import * as employeeRepository from '@/server/repositories/employee.repository';
import * as payrollPaymentRepository from '@/server/repositories/payroll-payment.repository';

type User = typeof users.$inferSelect;

// El actor llega resuelto desde el handler (`authorize()`): el servicio decide reglas
// de negocio, no vuelve a mirar la sesión.
type Command = { actor: User; context: AuditContext };

// Este service existe porque los pagos cruzan dos repositorios —`employee` (existe,
// está activo, cuándo ingresó) y `payroll-payment`—, que es la frontera de
// `docs/SETUP.md` §3. El CRUD de empleados se queda en sus handlers porque toca un solo
// repositorio y su bitácora, igual que productos y categorías (D-9).

// Ningún importe entra en la bitácora (D-8). `audit_logs.read` lo tienen `audit` y
// `manager`, que **no** tienen `payroll.read`, y la vista renderiza `changes` y
// `metadata` íntegros: escribir aquí `amountCents` publicaría los sueldos a quien se le
// acaba de negar el módulo. Lo que queda registrado es quién, cuándo, sobre qué empleado
// y de qué mes.
export async function registerPayment(
  command: Command & { input: CreatePayrollPaymentValues },
): Promise<PayrollPaymentRow> {
  const { actor, context, input } = command;

  return db.transaction(async (tx) => {
    // Con el `tx` y no con el `db` global: si el empleado se da de baja entre la
    // lectura y el INSERT, la comprobación de estado de abajo habría mirado una fila
    // rancia.
    const employee = await employeeRepository.findById(input.employeeId, tx);
    if (!employee) throw new NotFoundError(EMPLOYEE_NOT_FOUND_MESSAGE);

    const fullName = `${employee.firstName} ${employee.lastName}`;

    // 409 y no 400 ni 404: el cuerpo es válido y el recurso existe; lo que está en
    // conflicto es su estado (D-15, AC13).
    if (!employee.isActive) throw new ConflictError(inactiveEmployeeMessage(fullName));

    // Comparación lexicográfica de dos 'AAAA-MM-DD': el ancho fijo hace que el orden de
    // cadena sea el cronológico, así que no hace falta construir ningún `Date` (D-11).
    if (input.paidAt < employee.hiredAt) {
      throw new ValidationError(paidBeforeHiredMessage(employee.hiredAt));
    }

    // Pre-comprobación dentro de la transacción **además** del índice único parcial
    // (D-19): el índice garantiza el invariante bajo concurrencia, esto produce un
    // mensaje que nombra el mes. Un pago anulado no cuenta, así que corregir es anular
    // y volver a registrar (AC12).
    const live = await payrollPaymentRepository.findActiveByPeriod(
      input.employeeId,
      input.period,
      tx,
    );
    if (live) throw new ConflictError(duplicatePeriodMessage(input.period));

    const payment = await payrollPaymentRepository.insert(tx, input);

    await logAudit(tx, {
      actorId: actor.id,
      action: 'payroll_payment.registered',
      entityType: 'payroll_payment',
      entityId: payment.id,
      // `severity: 'warning'` en las cinco acciones del módulo: `info` se purga a los
      // 180 días y el alta desaparecería mientras los pagos siguen ahí (D-20).
      severity: 'warning',
      // Sin `amountCents`, aquí y en `metadata` (AC17).
      changes: { before: null, after: { period: payment.period, paidAt: payment.paidAt } },
      metadata: { employeeCode: employee.employeeCode },
      context,
    });

    return payment;
  });
}

export async function voidPayment(
  command: Command & { paymentId: string },
): Promise<PayrollPaymentRow> {
  const { actor, context, paymentId } = command;

  return db.transaction(async (tx) => {
    const before = await payrollPaymentRepository.findById(paymentId, tx);
    if (!before) throw new NotFoundError(PAYMENT_NOT_FOUND_MESSAGE);

    // Idempotente: anular lo ya anulado devuelve 200 sin escribir una segunda entrada
    // en la bitácora (AC15). Una entrada por cada clic repetido haría imposible contar
    // las anulaciones reales.
    if (before.status === 'voided') return before;

    const voided = await payrollPaymentRepository.markVoided(tx, paymentId);
    // `null` aquí significa que otra pestaña lo anuló entre la lectura y el UPDATE: el
    // resultado final es el mismo y tampoco hay nada nuevo que auditar (§10).
    if (!voided) return before;

    await logAudit(tx, {
      actorId: actor.id,
      action: 'payroll_payment.voided',
      entityType: 'payroll_payment',
      entityId: voided.id,
      severity: 'warning',
      // El `amount_cents` de la fila queda intacto en la tabla; lo que cambia —y lo
      // único que se registra— es el estado (AC15, AC17).
      changes: { before: { status: before.status }, after: { status: voided.status } },
      metadata: { employeeCode: voided.employeeCode, period: voided.period },
      context,
    });

    return voided;
  });
}
