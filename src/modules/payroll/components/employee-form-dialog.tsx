'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { fromCents, toCents } from '@/modules/products/lib/price';

import { EMPLOYEE_CODE_CONFLICT_MESSAGE } from '../constants';
import { useCreateEmployee, useUpdateEmployee } from '../hooks/use-employee-mutations';
import { employeeFormSchema, type EmployeeFormValues } from '../schemas/employee.schema';
import type { EmployeeRow } from '../types/employee.types';

type EmployeeFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = alta; una fila = edición. Mismo patrón que `ProductFormDialog`. */
  employee: EmployeeRow | null;
};

function toFormValues(employee: EmployeeRow | null): EmployeeFormValues {
  if (!employee) {
    return {
      employeeCode: '',
      firstName: '',
      lastName: '',
      jobTitle: '',
      hiredAt: '',
      baseSalary: '',
      isActive: true,
    };
  }

  return {
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle,
    hiredAt: employee.hiredAt,
    // El salario se edita en soles y vuelve a céntimos con `toCents`: aritmética de
    // cadenas, sin coma flotante en ningún paso (D-21).
    baseSalary: fromCents(employee.baseSalaryCents),
    isActive: employee.isActive,
  };
}

function EmployeeForm({
  employee,
  onDone,
  onCancel,
}: {
  employee: EmployeeRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = employee !== null;

  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const { control, formState, handleSubmit, register, setError } = useForm({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: toFormValues(employee),
  });

  const onSubmit = handleSubmit(async (values) => {
    const { baseSalary, ...rest } = values;
    const payload = { ...rest, baseSalaryCents: toCents(baseSalary) };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: employee.id, input: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar al empleado';

      // El interceptor de axios colapsa el error a su `message`, así que el 409 del
      // código duplicado se reconoce por la constante y se marca sobre el campo que hay
      // que corregir, no bajo el formulario (AC5).
      if (message === EMPLOYEE_CODE_CONFLICT_MESSAGE) {
        setError('employeeCode', { type: 'server', message });
        return;
      }

      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(formState.errors.employeeCode)}>
          <FieldLabel htmlFor="employee-code">Código de planilla</FieldLabel>
          <Input
            id="employee-code"
            autoComplete="off"
            placeholder="EMP-001"
            aria-invalid={Boolean(formState.errors.employeeCode)}
            {...register('employeeCode')}
          />
          <FieldDescription>
            Mayúsculas, números y guiones. Identifica a la persona sin guardar su DNI.
          </FieldDescription>
          <FieldError errors={[formState.errors.employeeCode]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(formState.errors.firstName)}>
            <FieldLabel htmlFor="employee-first-name">Nombre</FieldLabel>
            <Input
              id="employee-first-name"
              autoComplete="off"
              aria-invalid={Boolean(formState.errors.firstName)}
              {...register('firstName')}
            />
            <FieldError errors={[formState.errors.firstName]} />
          </Field>

          <Field data-invalid={Boolean(formState.errors.lastName)}>
            <FieldLabel htmlFor="employee-last-name">Apellido</FieldLabel>
            <Input
              id="employee-last-name"
              autoComplete="off"
              aria-invalid={Boolean(formState.errors.lastName)}
              {...register('lastName')}
            />
            <FieldError errors={[formState.errors.lastName]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(formState.errors.jobTitle)}>
          <FieldLabel htmlFor="employee-job-title">Cargo</FieldLabel>
          <Input
            id="employee-job-title"
            autoComplete="off"
            placeholder="Encargado de almacén"
            aria-invalid={Boolean(formState.errors.jobTitle)}
            {...register('jobTitle')}
          />
          <FieldError errors={[formState.errors.jobTitle]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(formState.errors.hiredAt)}>
            <FieldLabel htmlFor="employee-hired-at">Fecha de ingreso</FieldLabel>
            <Input
              id="employee-hired-at"
              type="date"
              aria-invalid={Boolean(formState.errors.hiredAt)}
              {...register('hiredAt')}
            />
            <FieldDescription>Un día del calendario, sin hora.</FieldDescription>
            <FieldError errors={[formState.errors.hiredAt]} />
          </Field>

          <Field data-invalid={Boolean(formState.errors.baseSalary)}>
            <FieldLabel htmlFor="employee-base-salary">Salario base (S/)</FieldLabel>
            <Input
              id="employee-base-salary"
              inputMode="decimal"
              placeholder="2500.00"
              autoComplete="off"
              aria-invalid={Boolean(formState.errors.baseSalary)}
              {...register('baseSalary')}
            />
            <FieldDescription>Bruto mensual. Hasta dos decimales.</FieldDescription>
            <FieldError errors={[formState.errors.baseSalary]} />
          </Field>
        </div>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="employee-is-active">En plantilla</FieldLabel>
            <FieldDescription>
              Quien está fuera de plantilla conserva su historial de pagos, pero no admite
              pagos nuevos. Este es también el sitio donde se reactiva a alguien dado de baja.
            </FieldDescription>
          </FieldContent>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="employee-is-active"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </Field>

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Dar de alta'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// El formulario vive en un componente aparte y con `key`: al abrir el diálogo o cambiar
// de empleado se monta de cero, así los valores se inicializan en el montaje en vez de
// sincronizarse con un efecto.
export function EmployeeFormDialog({ open, onOpenChange, employee }: EmployeeFormDialogProps) {
  const isEdit = employee !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Los cambios quedan en la bitácora. El salario se registra como «modificado», sin las cifras.'
              : 'Registro de planilla. No crea ninguna cuenta de acceso al panel: eso se hace desde Usuarios.'}
          </DialogDescription>
        </DialogHeader>

        <EmployeeForm
          key={employee?.id ?? 'new'}
          employee={employee}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
