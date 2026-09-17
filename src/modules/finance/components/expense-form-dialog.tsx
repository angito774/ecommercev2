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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toReportingDayKey } from '@/lib/reporting';
import { fromCents, toCents } from '@/modules/products/lib/price';

import { EXPENSE_CATEGORY_LABELS } from '../constants';
import { useCreateExpense, useUpdateExpense } from '../hooks/use-expense-mutations';
import { EXPENSE_CATEGORIES } from '../schemas/finance.schema';
import { expenseFormSchema, type ExpenseFormValues } from '../schemas/expense-form.schema';
import type { ExpenseRow } from '../types/finance.types';

type ExpenseFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = alta; una fila = edición. Mismo patrón que `ProductFormDialog`. */
  expense: ExpenseRow | null;
};

function toFormValues(expense: ExpenseRow | null, today: string): ExpenseFormValues {
  if (!expense) {
    return { concept: '', amount: '', category: 'suppliers', incurredOn: today };
  }

  return {
    concept: expense.concept,
    // El importe se edita en soles y vuelve a céntimos con `toCents`: aritmética de
    // cadenas, sin coma flotante en ningún paso (D-19).
    amount: fromCents(expense.amountCents),
    category: expense.category,
    incurredOn: expense.incurredOn,
  };
}

function ExpenseForm({
  expense,
  today,
  onDone,
  onCancel,
}: {
  expense: ExpenseRow | null;
  today: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = expense !== null;

  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const { control, formState, handleSubmit, register, setError } = useForm({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: toFormValues(expense, today),
  });

  const onSubmit = handleSubmit(async (values) => {
    const { amount, ...rest } = values;
    const payload = { ...rest, amountCents: toCents(amount) };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: expense.id, input: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el gasto';
      // El diálogo no se cierra: el mensaje del servidor se pinta bajo el formulario
      // para que se pueda corregir y reintentar.
      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(formState.errors.concept)}>
          <FieldLabel htmlFor="expense-concept">Concepto</FieldLabel>
          <Input
            id="expense-concept"
            autoComplete="off"
            // Un concepto, no una nota libre: lo que se escriba aquí acaba copiado en
            // `audit_logs`, que es append-only y no se puede editar después (§10).
            placeholder="Alquiler del almacén"
            aria-invalid={Boolean(formState.errors.concept)}
            {...register('concept')}
          />
          <FieldDescription>Qué se pagó, en pocas palabras. Queda en la bitácora.</FieldDescription>
          <FieldError errors={[formState.errors.concept]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(formState.errors.amount)}>
            <FieldLabel htmlFor="expense-amount">Importe (S/)</FieldLabel>
            <Input
              id="expense-amount"
              inputMode="decimal"
              placeholder="1500.00"
              autoComplete="off"
              aria-invalid={Boolean(formState.errors.amount)}
              {...register('amount')}
            />
            <FieldDescription>Hasta dos decimales. Mayor que cero.</FieldDescription>
            <FieldError errors={[formState.errors.amount]} />
          </Field>

          <Field data-invalid={Boolean(formState.errors.incurredOn)}>
            <FieldLabel htmlFor="expense-incurred-on">Fecha del gasto</FieldLabel>
            <Input
              id="expense-incurred-on"
              type="date"
              // El servidor lo vuelve a comprobar contra el día de hoy en Lima: esto
              // solo evita el viaje (AC13).
              max={today}
              aria-invalid={Boolean(formState.errors.incurredOn)}
              {...register('incurredOn')}
            />
            <FieldDescription>No puede ser futura.</FieldDescription>
            <FieldError errors={[formState.errors.incurredOn]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(formState.errors.category)}>
          <FieldLabel htmlFor="expense-category">Categoría</FieldLabel>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="expense-category"
                  aria-invalid={Boolean(formState.errors.category)}
                  className="w-full"
                >
                  {/* Texto explícito: `SelectValue` depende de que el item esté montado
                      y el contenido solo se monta al abrir el desplegable. */}
                  <SelectValue>{EXPENSE_CATEGORY_LABELS[field.value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {EXPENSE_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[formState.errors.category]} />
        </Field>

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar gasto'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// El formulario vive en un componente aparte y con `key`: al abrir el diálogo o cambiar
// de gasto se monta de cero, así los valores se inicializan en el montaje en vez de
// sincronizarse con un efecto.
export function ExpenseFormDialog({ open, onOpenChange, expense }: ExpenseFormDialogProps) {
  const isEdit = expense !== null;
  // El día de hoy **en Lima**, no el del navegador: entre las 19:00 y medianoche un
  // navegador en UTC ofrecería mañana como tope y el servidor lo rechazaría.
  const today = toReportingDayKey(new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Los cambios quedan registrados en la bitácora con el estado anterior.'
              : 'Gastos de operación. Los salarios y la nómina no se registran aquí.'}
          </DialogDescription>
        </DialogHeader>

        <ExpenseForm
          key={expense?.id ?? 'new'}
          expense={expense}
          today={today}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
