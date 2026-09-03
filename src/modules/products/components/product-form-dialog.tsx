'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { slugify } from '@/lib/utils';
import { useCategories } from '@/modules/categories/hooks/use-categories';

import { PRODUCT_SKU_CONFLICT_MESSAGE, PRODUCT_SLUG_CONFLICT_MESSAGE } from '../constants';
import { useCreateProduct, useUpdateProduct } from '../hooks/use-product-mutations';
import { fromCents, toCents } from '../lib/price';
import { productFormSchema, type ProductFormValues } from '../schemas/product.schema';
import type { ProductWithCategory } from '../types/product.types';

type ProductFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithCategory | null;
};

const EMPTY_VALUES: ProductFormValues = {
  sku: '',
  name: '',
  slug: '',
  description: null,
  imageUrl: null,
  price: '',
  stock: 0,
  specs: [],
  categoryId: '',
  isActive: true,
};

function toFormValues(product: ProductWithCategory | null): ProductFormValues {
  if (!product) return EMPTY_VALUES;

  return {
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    description: product.description,
    imageUrl: product.imageUrl,
    price: fromCents(product.priceCents),
    stock: product.stock,
    specs: Object.entries(product.specs ?? {}).map(([key, value]) => ({ key, value })),
    categoryId: product.categoryId,
    isActive: product.isActive,
  };
}

// Las filas con la clave en blanco se descartan en silencio: son las que quedan al
// pulsar "Añadir" y no rellenar nada, y rechazar el formulario por eso sería
// castigar un gesto normal.
function specsToRecord(rows: ProductFormValues['specs']): Record<string, string> | null {
  const entries = rows
    .map((row) => [row.key.trim(), row.value.trim()] as const)
    .filter(([key]) => key !== '');

  return entries.length === 0 ? null : Object.fromEntries(entries);
}

// React Hook Form pasa por aquí también el default value del montaje, que es
// `null` para estos campos: no se puede asumir string.
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

function ProductForm({
  product,
  onDone,
  onCancel,
}: {
  product: ProductWithCategory | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = product !== null;
  // Al editar, el slug ya existe y no debe reescribirse al tocar el nombre.
  const [slugTouched, setSlugTouched] = useState(isEdit);

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Solo categorías activas, hasta 100 (spec 003 §11 lo deja escrito como deuda).
  // Se reutiliza el endpoint de categorías en vez de crear uno propio: los cuatro
  // roles con `products.*` tienen también `categories.read`.
  const categoriesQuery = useCategories({
    status: 'active',
    page: 1,
    pageSize: 100,
    sortBy: 'name',
    sortDir: 'asc',
  });

  const activeCategories = categoriesQuery.data?.data ?? [];

  // Si la categoría del producto se desactivó, no viene en la lista y el
  // desplegable aparecería en blanco al editar. Se añade su opción para que el
  // producto siga siendo editable (spec 003 §8).
  const categoryOptions =
    product && !activeCategories.some((category) => category.id === product.categoryId)
      ? [
          ...activeCategories,
          { id: product.categoryId, name: `${product.categoryName} (inactiva)` },
        ]
      : activeCategories;

  const { control, formState, handleSubmit, register, setError, setValue } = useForm({
    resolver: zodResolver(productFormSchema),
    defaultValues: toFormValues(product),
  });

  const specs = useFieldArray({ control, name: 'specs' });

  const onSubmit = handleSubmit(async (values) => {
    const { price, specs: specRows, ...rest } = values;
    const payload = { ...rest, priceCents: toCents(price), specs: specsToRecord(specRows) };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: product.id, input: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el producto';

      // Los dos 409 se distinguen por su constante y cada uno marca su campo, sin
      // cerrar el diálogo (AC9). El status no llega: el interceptor de axios lo
      // descarta y deja solo el mensaje.
      if (message === PRODUCT_SKU_CONFLICT_MESSAGE) {
        setError('sku', { type: 'server', message });
        return;
      }
      if (message === PRODUCT_SLUG_CONFLICT_MESSAGE) {
        setError('slug', { type: 'server', message });
        return;
      }

      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(formState.errors.sku)}>
            <FieldLabel htmlFor="product-sku">SKU</FieldLabel>
            <Input
              id="product-sku"
              autoComplete="off"
              placeholder="LEN-IP3-15"
              aria-invalid={Boolean(formState.errors.sku)}
              {...register('sku')}
            />
            <FieldDescription>Mayúsculas, números y guiones. Único e irrepetible.</FieldDescription>
            <FieldError errors={[formState.errors.sku]} />
          </Field>

          <Field data-invalid={Boolean(formState.errors.categoryId)}>
            <FieldLabel htmlFor="product-category">Categoría</FieldLabel>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="product-category" aria-invalid={Boolean(formState.errors.categoryId)}>
                    <SelectValue placeholder="Elige una categoría">
                      {categoryOptions.find((category) => category.id === field.value)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {categoriesQuery.isError ? (
              <FieldDescription className="text-destructive">
                No se pudieron cargar las categorías.
              </FieldDescription>
            ) : null}
            <FieldError errors={[formState.errors.categoryId]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(formState.errors.name)}>
          <FieldLabel htmlFor="product-name">Nombre</FieldLabel>
          <Input
            id="product-name"
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.name)}
            {...register('name', {
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                if (!slugTouched) setValue('slug', slugify(event.target.value));
              },
            })}
          />
          <FieldError errors={[formState.errors.name]} />
        </Field>

        <Field data-invalid={Boolean(formState.errors.slug)}>
          <FieldLabel htmlFor="product-slug">Slug</FieldLabel>
          <Input
            id="product-slug"
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.slug)}
            {...register('slug', { onChange: () => setSlugTouched(true) })}
          />
          <FieldDescription>
            Solo minúsculas, números y guiones. Identificará el producto en la URL pública.
          </FieldDescription>
          <FieldError errors={[formState.errors.slug]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(formState.errors.price)}>
            <FieldLabel htmlFor="product-price">Precio (S/)</FieldLabel>
            <Input
              id="product-price"
              inputMode="decimal"
              placeholder="1299.90"
              autoComplete="off"
              aria-invalid={Boolean(formState.errors.price)}
              {...register('price')}
            />
            <FieldDescription>Hasta dos decimales.</FieldDescription>
            <FieldError errors={[formState.errors.price]} />
          </Field>

          <Field data-invalid={Boolean(formState.errors.stock)}>
            <FieldLabel htmlFor="product-stock">Stock</FieldLabel>
            <Input
              id="product-stock"
              type="number"
              min={0}
              step={1}
              aria-invalid={Boolean(formState.errors.stock)}
              {...register('stock', { valueAsNumber: true })}
            />
            <FieldError errors={[formState.errors.stock]} />
          </Field>
        </div>

        <Field data-invalid={Boolean(formState.errors.description)}>
          <FieldLabel htmlFor="product-description">Descripción</FieldLabel>
          <Textarea
            id="product-description"
            rows={3}
            aria-invalid={Boolean(formState.errors.description)}
            {...register('description', { setValueAs: emptyToNull })}
          />
          <FieldError errors={[formState.errors.description]} />
        </Field>

        <Field data-invalid={Boolean(formState.errors.imageUrl)}>
          <FieldLabel htmlFor="product-image-url">URL de la imagen</FieldLabel>
          <Input
            id="product-image-url"
            inputMode="url"
            placeholder="https://…"
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.imageUrl)}
            {...register('imageUrl', { setValueAs: emptyToNull })}
          />
          <FieldError errors={[formState.errors.imageUrl]} />
        </Field>

        <Field>
          <FieldLabel>Características</FieldLabel>
          <FieldDescription>
            Pares de dato y valor, como Procesador / Apple M2. Las filas sin nombre se descartan.
          </FieldDescription>

          <div className="space-y-2">
            {specs.fields.map((row, index) => (
              <div key={row.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Nombre de la característica ${index + 1}`}
                  placeholder="Procesador"
                  {...register(`specs.${index}.key`)}
                />
                <Input
                  aria-label={`Valor de la característica ${index + 1}`}
                  placeholder="Apple M2"
                  {...register(`specs.${index}.value`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  onClick={() => specs.remove(index)}
                >
                  <X className="size-4" aria-hidden />
                  <span className="sr-only">Quitar la característica {index + 1}</span>
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => specs.append({ key: '', value: '' })}
            >
              <Plus className="size-4" aria-hidden />
              Añadir característica
            </Button>
          </div>
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="product-is-active">Activo</FieldLabel>
            <FieldDescription>Los productos inactivos no se muestran en la tienda.</FieldDescription>
          </FieldContent>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="product-is-active"
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
          {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// El formulario vive en un componente aparte y con `key`: al abrir el diálogo o
// cambiar de producto se monta de cero, así los valores y el estado del slug se
// inicializan en el montaje en vez de sincronizarse con un efecto.
export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const isEdit = product !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualiza los datos del producto. El SKU y el slug deben seguir siendo únicos.'
              : 'El slug se genera a partir del nombre y puedes ajustarlo manualmente.'}
          </DialogDescription>
        </DialogHeader>

        <ProductForm
          key={product?.id ?? 'new'}
          product={product}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
