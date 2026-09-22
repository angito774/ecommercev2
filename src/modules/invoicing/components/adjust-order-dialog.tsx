'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AdjustmentIntent } from '@/lib/electronic-documents';
import {
  buyerFormSchema,
  toBuyerPayload,
  type BuyerFormValues,
} from '@/modules/orders/schemas/checkout.schema';
import { formatPrice, fromCents, toCents } from '@/modules/products/lib/price';

import {
  ADJUSTMENT_AMOUNT_LABEL,
  ADJUSTMENT_CONFIRM_LABEL,
  ADJUSTMENT_INTENT_OPTIONS,
  ADJUSTMENT_INTENTS,
  ADJUSTMENT_NO_STOCK_NOTE,
  ADJUSTMENT_PENDING_ISSUE_WARNING,
  ADJUSTMENT_REASON_LABEL,
  ADJUST_ORDER_DIALOG_DESCRIPTION,
  ADJUST_ORDER_DIALOG_TITLE,
  CREDIT_NOTE_REASONS,
  DEBIT_NOTE_AMOUNT_LABEL,
  DEBIT_NOTE_REASONS,
  DEBIT_NOTE_NO_CHARGE_NOTE,
  REASONS_BY_INTENT,
} from '../constants';
import { useAdjustOrder } from '../hooks/use-adjust-order';
import {
  adjustmentAmountFormSchema,
  orderAdjustmentSchema,
  type OrderAdjustmentInput,
} from '../schemas/order-adjustment.schema';

import { BuyerDocumentFields } from './buyer-document-fields';

const UNEXPECTED_INPUT_MESSAGE =
  'Ese motivo no corresponde al tipo de ajuste elegido. Vuelve a elegirlo antes de confirmar.';

const FALLBACK_ERROR_MESSAGE = 'No se pudo ajustar el pedido';

/**
 * El cuerpo se valida en el cliente con **el mismo schema que la API**, y no con un tipo
 * escrito a mano: el motivo vive en un `useState<string>` —lo produce un `Select`, que solo
 * habla en cadenas— y esta es la única forma de estrecharlo a la rama que le toca sin un
 * `as`. De paso, un motivo que no corresponda a la intención se detiene aquí en vez de
 * viajar hasta el 400 del servidor (AC13).
 */
function parseAdjustment(candidate: unknown): OrderAdjustmentInput | null {
  const parsed = orderAdjustmentSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : FALLBACK_ERROR_MESSAGE;
}

type AdjustOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amountTotalCents: number;
  refundedAmountCents: number;
};

/**
 * Las etiquetas del motivo, resueltas contra el catálogo que le toca a la intención. Los
 * dos catálogos comparten los dígitos `01`, `02` y `03` con significados distintos, así que
 * leerlos del catálogo equivocado pintaría «Intereses por mora» en una nota de crédito.
 */
function reasonOptions(intent: AdjustmentIntent): ReadonlyArray<{ code: string; label: string }> {
  const catalog = intent === 'cargo_adicional' ? DEBIT_NOTE_REASONS : CREDIT_NOTE_REASONS;
  const admitted: readonly string[] = REASONS_BY_INTENT[intent];

  // Se filtra el catálogo con la **misma tabla** que Zod usa para construir el enum de cada
  // rama, así que la UI no puede ofrecer un motivo que el servidor vaya a rechazar (AC13).
  return catalog.filter((reason) => admitted.includes(reason.code));
}

function ReasonSelect({
  intent,
  value,
  onChange,
  disabled,
}: {
  intent: AdjustmentIntent;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="adjustment-reason">{ADJUSTMENT_REASON_LABEL}</FieldLabel>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="adjustment-reason" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {reasonOptions(intent).map((reason) => (
            <SelectItem key={reason.code} value={reason.code}>
              {reason.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        Es el código del catálogo de SUNAT que viajará en el documento.
      </FieldDescription>
    </Field>
  );
}

/** El aviso que se lee **antes** de confirmar, no después: el dinero sale ya (AC22, AC23). */
function PendingIssueWarning({ intent }: { intent: AdjustmentIntent }) {
  return (
    <div className="text-muted-foreground space-y-2 text-xs leading-relaxed">
      <p className="text-destructive flex gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{ADJUSTMENT_PENDING_ISSUE_WARNING}</span>
      </p>
      {intent === 'cargo_adicional' ? <p>{DEBIT_NOTE_NO_CHARGE_NOTE}</p> : null}
      {intent === 'anulacion_total' || intent === 'devolucion_parcial' ? (
        <p>{ADJUSTMENT_NO_STOCK_NOTE}</p>
      ) : null}
    </div>
  );
}

function DialogActions({
  pending,
  disabled,
  onCancel,
}: {
  pending: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter className="mt-6">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Ajustando…
          </>
        ) : (
          ADJUSTMENT_CONFIRM_LABEL
        )}
      </Button>
    </DialogFooter>
  );
}

type FormProps = {
  orderId: string;
  intent: AdjustmentIntent;
  reasonCode: string;
  onReasonChange: (value: string) => void;
  onDone: () => void;
  onCancel: () => void;
};

/**
 * Las tres intenciones que se expresan con un **importe**. Una sola forma para las tres, y
 * la diferencia es si el importe se teclea o lo calcula el servidor: la anulación total lo
 * muestra en solo lectura porque su importe es, por definición, el saldo, y aceptarlo del
 * cliente permitiría «anular totalmente» por menos del total (§6.1).
 */
function AmountAdjustmentForm({
  orderId,
  intent,
  reasonCode,
  onReasonChange,
  onDone,
  onCancel,
  refundableCents,
}: FormProps & { refundableCents: number }) {
  const mutation = useAdjustOrder();
  const isTotal = intent === 'anulacion_total';
  const isDebit = intent === 'cargo_adicional';

  const { formState, handleSubmit, register, setError, watch } = useForm({
    resolver: zodResolver(adjustmentAmountFormSchema),
    defaultValues: { amount: isTotal ? fromCents(Math.max(refundableCents, 0)) : '' },
  });

  const typed = watch('amount');
  // Solo para el resumen: lo que se manda es `toCents(values.amount)` ya validado. Un valor
  // a medio teclear no debe romper la línea que lo explica.
  const previewCents = adjustmentAmountFormSchema.safeParse({ amount: typed }).success
    ? toCents(typed)
    : null;

  // La anulación total sobre un pedido ya devuelto entero no tiene nada que anular, y el
  // servidor responde 409. Se bloquea aquí para no ofrecer algo que la API va a rechazar.
  const nothingToRefund = isTotal && refundableCents <= 0;

  const onSubmit = handleSubmit(async (values) => {
    // La traducción a céntimos ocurre aquí, en el borde del formulario: la API solo conoce
    // enteros (AC24).
    const input = parseAdjustment(
      isTotal
        ? { intent, reasonCode }
        : { intent, reasonCode, amountCents: toCents(values.amount) },
    );
    if (!input) {
      setError('root', { type: 'validate', message: UNEXPECTED_INPUT_MESSAGE });
      return;
    }

    try {
      await mutation.mutateAsync({ orderId, input });
      onDone();
    } catch (error) {
      // El diálogo **no** se cierra: el 409 de la carrera, el 400 del saldo y el 502 de
      // Stripe se leen aquí, donde se puede corregir el importe (AC22).
      setError('root', { type: 'server', message: toErrorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(formState.errors.amount)}>
          <FieldLabel htmlFor="adjustment-amount">
            {isDebit ? DEBIT_NOTE_AMOUNT_LABEL : ADJUSTMENT_AMOUNT_LABEL}
          </FieldLabel>
          <Input
            id="adjustment-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="120.00"
            // La anulación total no admite importe: se muestra el saldo que el servidor va
            // a devolver, y el valor no viaja en el cuerpo.
            readOnly={isTotal}
            aria-invalid={Boolean(formState.errors.amount)}
            disabled={mutation.isPending}
            {...register('amount')}
          />
          <FieldDescription>
            {isTotal
              ? 'Es el saldo que queda sin devolver. Lo calcula el servidor: no se puede anular el pedido entero por menos.'
              : isDebit
                ? 'Importe que documenta la nota de débito. No se cobra nada.'
                : `Disponible para devolver: ${formatPrice(Math.max(refundableCents, 0))}.`}
          </FieldDescription>
          <FieldError errors={[formState.errors.amount]} />
        </Field>

        <ReasonSelect
          intent={intent}
          value={reasonCode}
          onChange={onReasonChange}
          disabled={mutation.isPending}
        />

        {/* Resumen explícito de lo que va a pasar, antes de confirmar (T18). Nombra el
            dinero y el documento por separado porque son dos hechos distintos. */}
        {previewCents !== null ? (
          <p className="bg-muted/50 rounded-md border p-3 text-sm">
            {isDebit
              ? `Se registrará una nota de débito por ${formatPrice(previewCents)}. No se cobrará nada al cliente.`
              : `Se devolverán ${formatPrice(previewCents)} por Stripe y se registrará el documento de corrección por ese importe.`}
          </p>
        ) : null}

        {nothingToRefund ? (
          <p className="text-destructive text-sm">
            Este pedido ya está reembolsado por completo: no queda saldo que devolver.
          </p>
        ) : null}

        <PendingIssueWarning intent={intent} />

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogActions
        pending={mutation.isPending}
        disabled={nothingToRefund}
        onCancel={onCancel}
      />
    </form>
  );
}

/**
 * La corrección de los datos fiscales del comprador. Formulario propio y no una rama del
 * anterior: sus valores son los de `BuyerFormValues` y los valida el **mismo**
 * `buyerFormSchema` del checkout, lo que permite reutilizar `BuyerDocumentFields` tal cual
 * en vez de duplicar los tres campos y su regla de la razón social (spec 022, D-11).
 */
function BuyerCorrectionForm({
  orderId,
  intent,
  reasonCode,
  onReasonChange,
  onDone,
  onCancel,
}: FormProps) {
  const mutation = useAdjustOrder();

  const { control, formState, handleSubmit, register, setError, watch } =
    useForm<BuyerFormValues>({
      resolver: zodResolver(buyerFormSchema),
      // Vacío y no los datos actuales del pedido: este panel no publica el documento del
      // comprador (§10), así que no hay nada que precargar sin exponerlo por la API.
      defaultValues: { documentType: 'dni', documentNumber: '', legalName: '' },
    });

  const onSubmit = handleSubmit(async (values) => {
    const input = parseAdjustment({
      intent,
      reasonCode,
      // Única traducción de los valores del formulario al cuerpo de la API, compartida con
      // el checkout: `''` no es lo mismo que «sin razón social» (spec 022, §6.1).
      buyer: toBuyerPayload(values),
    });
    if (!input) {
      setError('root', { type: 'validate', message: UNEXPECTED_INPUT_MESSAGE });
      return;
    }

    try {
      await mutation.mutateAsync({ orderId, input });
      onDone();
    } catch (error) {
      setError('root', { type: 'server', message: toErrorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <BuyerDocumentFields
          control={control}
          register={register}
          errors={formState.errors}
          documentType={watch('documentType')}
          disabled={mutation.isPending}
        />

        <ReasonSelect
          intent={intent}
          value={reasonCode}
          onChange={onReasonChange}
          disabled={mutation.isPending}
        />

        <p className="bg-muted/50 rounded-md border p-3 text-sm">
          No se devolverá dinero. Se anulará el comprobante actual y quedará encolado uno
          nuevo con los datos corregidos, también pendiente de emisión.
        </p>

        <PendingIssueWarning intent={intent} />

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogActions pending={mutation.isPending} onCancel={onCancel} />
    </form>
  );
}

/**
 * La UI elige la **intención**, nunca el mecanismo SUNAT: si sale nota de crédito,
 * nota de débito o comunicación de baja lo decide `planAdjustment()` en el servidor (D-3).
 * Por eso ninguna etiqueta de este diálogo nombra un tipo de documento fiscal.
 */
export function AdjustOrderDialog({
  open,
  onOpenChange,
  orderId,
  amountTotalCents,
  refundedAmountCents,
}: AdjustOrderDialogProps) {
  const [intent, setIntent] = useState<AdjustmentIntent>('anulacion_total');
  const [reasonCode, setReasonCode] = useState<string>(REASONS_BY_INTENT.anulacion_total[0]);

  const refundableCents = amountTotalCents - refundedAmountCents;

  // El motivo se reinicia con la intención: los catálogos no se solapan, así que conservar
  // el anterior mandaría un código que el servidor rechaza con un 400 (AC13).
  // `RadioGroup` entrega un `string` suelto. Se estrecha buscándolo en `ADJUSTMENT_INTENTS`
  // —la misma lista de la que sale el tipo— en vez de castearlo: un valor que no sea una
  // intención no llega al estado, y el día que se añada una quinta no hay nada que tocar.
  function chooseIntent(value: string) {
    const next = ADJUSTMENT_INTENTS.find((intent) => intent === value);
    if (!next) return;

    setIntent(next);
    setReasonCode(REASONS_BY_INTENT[next][0]);
  }

  // Se desmonta al cerrar (`key` sobre la intención más el remontado del diálogo), así que
  // ni el importe tecleado ni el documento del comprador sobreviven a un cierre.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ADJUST_ORDER_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{ADJUST_ORDER_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>

        <dl className="text-muted-foreground grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs">Total del pedido</dt>
            <dd className="text-foreground tabular-nums">{formatPrice(amountTotalCents)}</dd>
          </div>
          <div>
            <dt className="text-xs">Saldo devolvible</dt>
            <dd className="text-foreground tabular-nums">
              {formatPrice(Math.max(refundableCents, 0))}
            </dd>
          </div>
        </dl>

        <RadioGroup
          value={intent}
          onValueChange={chooseIntent}
          aria-label="Qué se va a ajustar"
        >
          {ADJUSTMENT_INTENT_OPTIONS.map((option) => (
            <FieldLabel
              key={option.value}
              htmlFor={`adjustment-intent-${option.value}`}
              className="border-border has-data-checked:border-primary flex items-start gap-2.5 rounded-xl border p-3 text-sm"
            >
              <RadioGroupItem
                value={option.value}
                id={`adjustment-intent-${option.value}`}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block font-medium">{option.label}</span>
                <span className="text-muted-foreground block text-xs">
                  {option.description}
                </span>
              </span>
            </FieldLabel>
          ))}
        </RadioGroup>

        {/* `key` sobre la intención: cambiar de intención monta un formulario nuevo, así que
            el importe tecleado para una devolución parcial no reaparece dentro de un cargo
            adicional, que es otro concepto con otro signo. */}
        {intent === 'correccion_comprador' ? (
          <BuyerCorrectionForm
            key={intent}
            orderId={orderId}
            intent={intent}
            reasonCode={reasonCode}
            onReasonChange={setReasonCode}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <AmountAdjustmentForm
            key={intent}
            orderId={orderId}
            intent={intent}
            reasonCode={reasonCode}
            onReasonChange={setReasonCode}
            refundableCents={refundableCents}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
