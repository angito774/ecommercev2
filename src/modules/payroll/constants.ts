import { formatPeriodLabel } from './lib/payroll-dates';
import type { EmployeeQueryParams } from './schemas/employee.schema';
import type { PayrollQueryParams } from './schemas/payroll.schema';
import type { PayrollPaymentStatus } from './types/payroll.types';

export const EMPLOYEE_PAGE_SIZE = 20;

export const PAYROLL_PAGE_SIZE = 20;

export const PAYROLL_SEARCH_DEBOUNCE_MS = 300;

// Mapa total sobre `PayrollPaymentStatus`: un estado nuevo rompe el typecheck aquí en
// vez de pintar el código crudo en la tabla.
export const PAYMENT_STATUS_LABELS: Record<PayrollPaymentStatus, string> = {
  paid: 'Pagado',
  voided: 'Anulado',
};

// El interceptor de `src/lib/axios.ts` colapsa la respuesta de error a su `message` y
// descarta el status, así que el diálogo reconoce cada 409 por su constante.
export const EMPLOYEE_CODE_CONFLICT_MESSAGE =
  'Ya existe un empleado con ese código. El personal dado de baja también lo reserva.';

// Nombre real del constraint, tal y como lo creó la migración y como lo devuelve
// Postgres en el error 23505.
export const EMPLOYEE_CONFLICT_MESSAGES: Record<string, string> = {
  employees_employee_code_unique: EMPLOYEE_CODE_CONFLICT_MESSAGE,
};

export const PAYROLL_PERIOD_CONFLICT_MESSAGE =
  'Ese empleado ya tiene un pago registrado para ese mes. Anúlalo antes de volver a registrarlo.';

// Red de seguridad del índice único parcial (D-19): si dos pestañas registran el mismo
// periodo a la vez, el segundo INSERT llega aquí como 409 y no como 500. El nombre es
// el del índice, que es lo que Postgres reporta en el 23505.
export const PAYROLL_CONFLICT_MESSAGES: Record<string, string> = {
  payroll_payments_employee_period_active_idx: PAYROLL_PERIOD_CONFLICT_MESSAGE,
};

export const EMPLOYEE_NOT_FOUND_MESSAGE = 'Empleado no encontrado';

export const PAYMENT_NOT_FOUND_MESSAGE = 'Pago de nómina no encontrado';

export const INVALID_EMPLOYEE_ID_MESSAGE = 'El identificador del empleado no es válido';

export const INVALID_PAYMENT_ID_MESSAGE = 'El identificador del pago no es válido';

// 409 y no 400: el cuerpo es válido y lo que está en conflicto es el estado del
// recurso, igual que cancelar un pedido que ya no está `pending` (D-15).
export function inactiveEmployeeMessage(fullName: string): string {
  return `${fullName} está dado de baja. Reactívalo antes de registrarle un pago.`;
}

// El interceptor de axios deja solo el `message`, así que el diálogo reconoce el 409
// del mes duplicado por este prefijo. Constante compartida y no una subcadena suelta en
// el componente: el día que cambie el copy, el `setError` sobre el campo `period`
// dejaría de dispararse en silencio.
export const DUPLICATE_PERIOD_PREFIX = 'Ya hay un pago vivo de';

// El mensaje nombra el mes en lugar de caer al genérico: es lo que aporta la
// pre-comprobación frente al índice, que solo sabe que algo chocó (D-19).
export function duplicatePeriodMessage(period: string): string {
  return `${DUPLICATE_PERIOD_PREFIX} ${formatPeriodLabel(period)} para este empleado. Anúlalo antes de registrar otro.`;
}

/** Los dos 409 de periodo: el de la pre-comprobación y el del índice único (D-19). */
export function isDuplicatePeriodMessage(message: string): boolean {
  return message === PAYROLL_PERIOD_CONFLICT_MESSAGE || message.startsWith(DUPLICATE_PERIOD_PREFIX);
}

// El único invariante cruzado de fechas del módulo (D-16): atrapa el error de tecleo
// más probable, que es el año.
export function paidBeforeHiredMessage(hiredAt: string): string {
  return `La fecha de pago no puede ser anterior al ingreso del empleado (${hiredAt}).`;
}

// Los copys de los estados vacíos viven juntos porque todos dicen la misma cosa con
// distintas palabras —«no hay datos» no es «hubo un error»— y separarlos por componente
// hace que uno se desalinee del resto (AC19).
export const EMPTY_EMPLOYEES_TITLE = 'Todavía no hay personal dado de alta';

export const EMPTY_EMPLOYEES_MESSAGE =
  'Registra a la primera persona de la planilla para poder anotarle sus pagos.';

export const EMPTY_PAYMENTS_TITLE = 'Todavía no hay pagos registrados';

// El pago se registra desde la ficha del empleado y no desde un selector aquí (D-17):
// el estado vacío es el único sitio donde eso se puede explicar.
export const EMPTY_PAYMENTS_MESSAGE =
  'Los pagos se registran desde la pestaña Personal, con la acción de la fila del empleado.';

export const NO_EMPLOYEE_RESULTS_TITLE = 'Sin resultados';

export const NO_EMPLOYEE_RESULTS_MESSAGE =
  'Nadie de la planilla coincide con la búsqueda o el estado elegido.';

export const NO_PAYMENT_RESULTS_TITLE = 'Sin resultados';

export const NO_PAYMENT_RESULTS_MESSAGE =
  'Ningún pago coincide con el mes o la búsqueda elegidos.';

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (params: EmployeeQueryParams) => [...employeeKeys.lists(), params] as const,
};

export const payrollKeys = {
  all: ['payroll-payments'] as const,
  lists: () => [...payrollKeys.all, 'list'] as const,
  list: (params: PayrollQueryParams) => [...payrollKeys.lists(), params] as const,
};
