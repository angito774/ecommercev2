'use client';

import type { Control, FieldErrors } from 'react-hook-form';
import { Controller, type UseFormRegister } from 'react-hook-form';

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  BUYER_DOCUMENT_LABELS,
  BUYER_DOCUMENT_TYPES,
  type BuyerFormValues,
} from '@/modules/orders/schemas/checkout.schema';
import { documentLength } from '@/modules/orders/lib/peru-document';

type BuyerDocumentFieldsProps = {
  control: Control<BuyerFormValues>;
  register: UseFormRegister<BuyerFormValues>;
  errors: FieldErrors<BuyerFormValues>;
  /** Tipo elegido ahora mismo: decide si la razón social se pide o ni se monta. */
  documentType: BuyerFormValues['documentType'];
  disabled?: boolean;
};

/**
 * Los tres campos fiscales del comprador. **Vive en `invoicing` y no en `orders`** aunque lo
 * monte el checkout: la facturación es un dominio propio y el spec 023 va a necesitar estos
 * mismos campos para corregir un comprobante (D-11).
 *
 * No conoce la mutación ni el envío: recibe el `control` del formulario de quien lo monta,
 * así que es reutilizable en cualquier `useForm` cuyos valores encajen con
 * `BuyerFormValues`.
 */
export function BuyerDocumentFields({
  control,
  register,
  errors,
  documentType,
  disabled,
}: BuyerDocumentFieldsProps) {
  const needsLegalName = documentType === 'ruc';
  const expectedLength = documentLength(documentType);

  return (
    <FieldSet>
      <FieldLegend>Datos para tu comprobante</FieldLegend>

      {/* `RadioGroup` y no un `Select`: son dos opciones excluyentes y ambas tienen que
          estar a la vista, porque elegir factura cambia lo que se pide debajo. */}
      <Controller
        control={control}
        name="documentType"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor="buyer-document-type-dni">Tipo de comprobante</FieldLabel>
            <RadioGroup
              value={field.value}
              onValueChange={field.onChange}
              disabled={disabled}
              className="grid-cols-2"
              aria-label="Tipo de comprobante"
            >
              {BUYER_DOCUMENT_TYPES.map((type) => (
                <FieldLabel
                  key={type}
                  htmlFor={`buyer-document-type-${type}`}
                  className="border-border has-data-checked:border-primary flex items-center gap-2.5 rounded-xl border p-3 text-sm"
                >
                  <RadioGroupItem value={type} id={`buyer-document-type-${type}`} />
                  {BUYER_DOCUMENT_LABELS[type]}
                </FieldLabel>
              ))}
            </RadioGroup>
          </Field>
        )}
      />

      <Field data-invalid={Boolean(errors.documentNumber)}>
        <FieldLabel htmlFor="buyer-document-number">
          {needsLegalName ? 'RUC' : 'DNI'}
        </FieldLabel>
        <Input
          id="buyer-document-number"
          inputMode="numeric"
          autoComplete="off"
          // `maxLength` acompaña a la validación, no la sustituye: recortar en el navegador
          // evita teclear de más, pero quien manda el cuerpo a mano sigue pasando por Zod.
          maxLength={expectedLength}
          placeholder={'0'.repeat(expectedLength)}
          aria-invalid={Boolean(errors.documentNumber)}
          disabled={disabled}
          {...register('documentNumber')}
        />
        <FieldDescription>
          {needsLegalName
            ? 'Los 11 dígitos del RUC de la empresa. Se comprueba el dígito verificador.'
            : 'Los 8 dígitos de tu DNI. Con RUC emitimos factura.'}
        </FieldDescription>
        <FieldError errors={[errors.documentNumber]} />
      </Field>

      {/* El campo **no se monta** cuando es boleta, en vez de montarse deshabilitado: la
          razón social solo existe en una factura, y el `CHECK
          orders_buyer_legal_name_requires_ruc` dice lo mismo en la base (AC3). */}
      {needsLegalName ? (
        <Field data-invalid={Boolean(errors.legalName)}>
          <FieldLabel htmlFor="buyer-legal-name">Razón social</FieldLabel>
          <Input
            id="buyer-legal-name"
            autoComplete="organization"
            placeholder="EMPRESA EJEMPLO SAC"
            aria-invalid={Boolean(errors.legalName)}
            disabled={disabled}
            {...register('legalName')}
          />
          <FieldDescription>Tal y como figura en la ficha RUC.</FieldDescription>
          <FieldError errors={[errors.legalName]} />
        </Field>
      ) : null}
    </FieldSet>
  );
}
