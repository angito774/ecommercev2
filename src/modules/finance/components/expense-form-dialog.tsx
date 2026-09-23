'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';

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
import { Switch } from '@/components/ui/switch';
import {
  PURCHASE_RECEIPT_TYPE_LABELS,
  PURCHASE_RECEIPT_TYPES,
} from '@/lib/purchase-receipts';
import { toReportingDayKey } from '@/lib/reporting';
import { fromCents, toCents } from '@/modules/products/lib/price';

import {
  EXPENSE_CATEGORY_LABELS,
  HAS_RECEIPT_SWITCH_HINT,
  HAS_RECEIPT_SWITCH_LABEL,
  IGV_COMPUTED_HINT,
  RECEIPT_SERIES_HINT,
  SUPPLIER_NAME_HINT,
  SUPPLIER_RUC_HINT,
} from '../constants';
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

// Los seis campos del comprobante apagados. El `receiptType` arranca en `factura` y no
// vacío porque el `Select` necesita un valor: con el interruptor apagado no se pinta y no
// viaja en el cuerpo (AC18).
const EMPTY_RECEIPT_FIELDS = {
  hasReceipt: false,
  receiptType: 'factura',
  supplierRuc: '',
  supplierName: '',
  receiptSeries: '',
  receiptNumber: '',
} as const satisfies Partial<ExpenseFormValues>;

function toFormValues(expense: ExpenseRow | null, today: string): ExpenseFormValues {
  if (!expense) {
    return {
      concept: '',
      amount: '',
      category: 'suppliers',
      incurredOn: today,
      ...EMPTY_RECEIPT_FIELDS,
    };
  }

  const { receipt } = expense;

  return {
    concept: expense.concept,
    // El importe se edita en soles y vuelve a céntimos con `toCents`: aritmética de
    // cadenas, sin coma flotante en ningún paso (D-19).
    amount: fromCents(expense.amountCents),
    category: expense.category,
    incurredOn: expense.incurredOn,
    // En edición el interruptor arranca encendido si el gasto ya tenía comprobante.
    ...EMPTY_RECEIPT_FIELDS,
    ...(receipt
      ? {
          hasReceipt: true,
          receiptType: receipt.type,
          supplierRuc: receipt.supplierRuc,
          supplierName: receipt.supplierName,
          receiptSeries: receipt.series ?? '',
          receiptNumber: receipt.number ?? '',
        }
      : {}),
  };
}

// El diálogo **no** manda los seis campos planos: arma el `receipt` del contrato cuando
// el interruptor está encendido y `null` cuando no, así que lo tecleado y luego
// descartado no viaja aunque React Hook Form lo conserve en su registro (AC18).
//
// `igvCents` no aparece por ningún lado: lo calcula el servidor (AC7).
function toReceiptPayload(values: ExpenseFormValues) {
  if (!values.hasReceipt) return null;

  const hasPair = values.receiptSeries !== '' && values.receiptNumber !== '';

  return {
    type: values.receiptType,
    supplierRuc: values.supplierRuc,
    supplierName: values.supplierName,
    // Los dos o ninguno: el schema de la API rechaza media referencia (AC12).
    ...(hasPair ? { series: values.receiptSeries, number: values.receiptNumber } : {}),
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

  // El bloque del comprobante se **desmonta** al apagar el interruptor, no se oculta con
  // CSS: un campo oculto seguiría en el DOM y en el registro del formulario.
  //
  // `useWatch` y no `watch()`, mismo criterio que el diálogo de inventario (spec 021) y
  // el checkout (022): suscribe solo a este campo y `watch()` no se puede memoizar.
  const hasReceipt = useWatch({ control, name: 'hasReceipt' });

  const onSubmit = handleSubmit(async (values) => {
    // El cuerpo se arma **en positivo**, campo a campo, y no con un `...rest`: así
    // ningún campo del bloque del comprobante puede colarse por descuido, que es
    // exactamente lo que afirma AC18.
    const payload = {
      concept: values.concept,
      amountCents: toCents(values.amount),
      category: values.category,
      incurredOn: values.incurredOn,
      receipt: toReceiptPayload(values),
    };

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

        <div className="border-t pt-4">
          <Controller
            control={control}
            name="hasReceipt"
            render={({ field }) => (
              <Field orientation="horizontal">
                <Switch
                  id="expense-has-receipt"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <div className="space-y-0.5">
                  <FieldLabel htmlFor="expense-has-receipt">
                    {HAS_RECEIPT_SWITCH_LABEL}
                  </FieldLabel>
                  <FieldDescription>{HAS_RECEIPT_SWITCH_HINT}</FieldDescription>
                </div>
              </Field>
            )}
          />
        </div>

        {/* Montaje condicional y no `hidden`: al apagar el interruptor los campos dejan
            de existir en el DOM, y el cuerpo se arma desde `toReceiptPayload` (AC18). */}
        {hasReceipt ? (
          <>
            <Field data-invalid={Boolean(formState.errors.receiptType)}>
              <FieldLabel htmlFor="expense-receipt-type">Tipo de comprobante</FieldLabel>
              <Controller
                control={control}
                name="receiptType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="expense-receipt-type" className="w-full">
                      <SelectValue>{PURCHASE_RECEIPT_TYPE_LABELS[field.value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PURCHASE_RECEIPT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {PURCHASE_RECEIPT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>{IGV_COMPUTED_HINT}</FieldDescription>
              <FieldError errors={[formState.errors.receiptType]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(formState.errors.supplierRuc)}>
                <FieldLabel htmlFor="expense-supplier-ruc">RUC del proveedor</FieldLabel>
                <Input
                  id="expense-supplier-ruc"
                  inputMode="numeric"
                  placeholder="20100128056"
                  autoComplete="off"
                  aria-invalid={Boolean(formState.errors.supplierRuc)}
                  {...register('supplierRuc')}
                />
                <FieldDescription>{SUPPLIER_RUC_HINT}</FieldDescription>
                <FieldError errors={[formState.errors.supplierRuc]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.supplierName)}>
                <FieldLabel htmlFor="expense-supplier-name">Razón social</FieldLabel>
                <Input
                  id="expense-supplier-name"
                  autoComplete="off"
                  placeholder="Distribuidora Andina SAC"
                  aria-invalid={Boolean(formState.errors.supplierName)}
                  {...register('supplierName')}
                />
                <FieldDescription>{SUPPLIER_NAME_HINT}</FieldDescription>
                <FieldError errors={[formState.errors.supplierName]} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(formState.errors.receiptSeries)}>
                <FieldLabel htmlFor="expense-receipt-series">Serie</FieldLabel>
                <Input
                  id="expense-receipt-series"
                  placeholder="F001"
                  autoComplete="off"
                  aria-invalid={Boolean(formState.errors.receiptSeries)}
                  {...register('receiptSeries')}
                />
                <FieldDescription>{RECEIPT_SERIES_HINT}</FieldDescription>
                <FieldError errors={[formState.errors.receiptSeries]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.receiptNumber)}>
                <FieldLabel htmlFor="expense-receipt-number">Número</FieldLabel>
                <Input
                  id="expense-receipt-number"
                  inputMode="numeric"
                  // Se guarda como cadena: `00001234` no es `1234` cuando hay que
                  // cotejarlo con el papel (D-14).
                  placeholder="00001234"
                  autoComplete="off"
                  aria-invalid={Boolean(formState.errors.receiptNumber)}
                  {...register('receiptNumber')}
                />
                <FieldError errors={[formState.errors.receiptNumber]} />
              </Field>
            </div>
          </>
        ) : null}

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
