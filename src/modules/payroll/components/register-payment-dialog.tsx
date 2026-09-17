'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { fromCents, toCents } from '@/modules/products/lib/price';

import { isDuplicatePeriodMessage } from '../constants';
import { useRegisterPayment } from '../hooks/use-payroll-mutations';
import { currentPayrollPeriod } from '../lib/payroll-dates';
import {
  payrollPaymentFormSchema,
  type PayrollPaymentFormValues,
} from '../schemas/payroll.schema';
import type { EmployeeRow } from '../types/employee.types';

type RegisterPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El empleado llega por props desde su fila (D-17): aquí no hay ningún selector. */
  employee: EmployeeRow | null;
};

// Hoy y el mes en curso en la fecha **local** del navegador, que en Perú es Lima. El
// servidor no deriva ninguna de las dos: las recibe en el cuerpo (D-13).
function toFormValues(employee: EmployeeRow, now: Date): PayrollPaymentFormValues {
  return {
    period: currentPayrollPeriod(now),
    paidAt: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`,
    // El salario base es una propuesta, no una imposición: un mes puede pagarse por otro
    // importe sin tocar la ficha, y el pago guarda su propio snapshot (D-6).
    amount: fromCents(employee.baseSalaryCents),
  };
}

function RegisterPaymentForm({
  employee,
  onDone,
  onCancel,
}: {
  employee: EmployeeRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const registerMutation = useRegisterPayment();

  const { formState, handleSubmit, register, setError } = useForm({
    resolver: zodResolver(payrollPaymentFormSchema),
    defaultValues: toFormValues(employee, new Date()),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerMutation.mutateAsync({
        employeeId: employee.id,
        period: values.period,
        paidAt: values.paidAt,
        amountCents: toCents(values.amount),
      });
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar el pago';

      // El 409 del mes duplicado se marca sobre el campo que hay que corregir (AC11).
      if (isDuplicatePeriodMessage(message)) {
        setError('period', { type: 'server', message });
        return;
      }

      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(formState.errors.period)}>
            <FieldLabel htmlFor="payment-period">Mes pagado</FieldLabel>
            <Input
              id="payment-period"
              type="month"
              aria-invalid={Boolean(formState.errors.period)}
              {...register('period')}
            />
            <FieldDescription>Un solo pago vivo por mes y empleado.</FieldDescription>
            <FieldError errors={[formState.errors.period]} />
          </Field>

          <Field data-invalid={Boolean(formState.errors.paidAt)}>
            <FieldLabel htmlFor="payment-paid-at">Fecha de pago</FieldLabel>
            <Input
              id="payment-paid-at"
              type="date"
              aria-invalid={Boolean(formState.errors.paidAt)}
              {...register('paidAt')}
            />
            <FieldDescription>No puede ser anterior a su ingreso.</FieldDescription>
            <FieldError errors={[formState.errors.paidAt]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(formState.errors.amount)}>
          <FieldLabel htmlFor="payment-amount">Importe (S/)</FieldLabel>
          <Input
            id="payment-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="2500.00"
            aria-invalid={Boolean(formState.errors.amount)}
            {...register('amount')}
          />
          <FieldDescription>
            Se propone su salario base. Lo que se guarde aquí no cambia si el salario sube
            después.
          </FieldDescription>
          <FieldError errors={[formState.errors.amount]} />
        </Field>

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={registerMutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Registrando…' : 'Registrar pago'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RegisterPaymentDialog({
  open,
  onOpenChange,
  employee,
}: RegisterPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Registrar pago a {employee?.firstName} {employee?.lastName}
          </DialogTitle>
          <DialogDescription>
            {/* El módulo registra pagos, no los calcula (D-3): decirlo aquí evita que
                alguien espere deducciones de AFP o quinta categoría. */}
            Anota un pago que ya se hizo. No calcula deducciones, aportes ni impuestos.
          </DialogDescription>
        </DialogHeader>

        {/* Con `key`: el formulario se monta de cero al cambiar de empleado, así el
            salario propuesto es siempre el de quien se está pagando. */}
        {employee ? (
          <RegisterPaymentForm
            key={employee.id}
            employee={employee}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
