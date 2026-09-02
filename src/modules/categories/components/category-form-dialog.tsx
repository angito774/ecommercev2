'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { slugify } from '@/lib/utils';

import { CATEGORY_SLUG_CONFLICT_MESSAGE } from '../constants';
import { useCreateCategory, useUpdateCategory } from '../hooks/use-category-mutations';
import { createCategorySchema, type CreateCategoryValues } from '../schemas/category.schema';
import type { Category } from '../types/category.types';

type CategoryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
};

const EMPTY_VALUES: CreateCategoryValues = {
  name: '',
  slug: '',
  description: null,
  imageUrl: null,
  isActive: true,
};

function toFormValues(category: Category | null): CreateCategoryValues {
  if (!category) return EMPTY_VALUES;

  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    isActive: category.isActive,
  };
}

// React Hook Form pasa por aquí también el default value del montaje, que es
// `null` para estos campos: no se puede asumir string.
const emptyToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

function CategoryForm({
  category,
  onDone,
  onCancel,
}: {
  category: Category | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = category !== null;
  // Al editar, el slug ya existe y no debe reescribirse al tocar el nombre.
  const [slugTouched, setSlugTouched] = useState(isEdit);

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const { control, formState, handleSubmit, register, setError, setValue } = useForm({
    resolver: zodResolver(createCategorySchema),
    defaultValues: toFormValues(category),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: category.id, input: values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar la categoría';

      // El 409 de slug duplicado se muestra junto al campo y el diálogo sigue
      // abierto para que el admin corrija sin reescribir el resto (AC6).
      if (message === CATEGORY_SLUG_CONFLICT_MESSAGE) {
        setError('slug', { type: 'server', message });
        return;
      }

      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(formState.errors.name)}>
          <FieldLabel htmlFor="category-name">Nombre</FieldLabel>
          <Input
            id="category-name"
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
          <FieldLabel htmlFor="category-slug">Slug</FieldLabel>
          <Input
            id="category-slug"
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.slug)}
            {...register('slug', { onChange: () => setSlugTouched(true) })}
          />
          <FieldDescription>
            Solo minúsculas, números y guiones. Identifica la categoría en la URL pública.
          </FieldDescription>
          <FieldError errors={[formState.errors.slug]} />
        </Field>

        <Field data-invalid={Boolean(formState.errors.description)}>
          <FieldLabel htmlFor="category-description">Descripción</FieldLabel>
          <Textarea
            id="category-description"
            rows={3}
            aria-invalid={Boolean(formState.errors.description)}
            {...register('description', { setValueAs: emptyToNull })}
          />
          <FieldError errors={[formState.errors.description]} />
        </Field>

        <Field data-invalid={Boolean(formState.errors.imageUrl)}>
          <FieldLabel htmlFor="category-image-url">URL de la imagen</FieldLabel>
          <Input
            id="category-image-url"
            inputMode="url"
            placeholder="https://…"
            autoComplete="off"
            aria-invalid={Boolean(formState.errors.imageUrl)}
            {...register('imageUrl', { setValueAs: emptyToNull })}
          />
          <FieldError errors={[formState.errors.imageUrl]} />
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="category-is-active">Activa</FieldLabel>
            <FieldDescription>
              Las categorías inactivas no se muestran en la tienda.
            </FieldDescription>
          </FieldContent>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch
                id="category-is-active"
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
          {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear categoría'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// El formulario vive en un componente aparte y con `key`: al abrir el diálogo o
// cambiar de categoría se monta de cero, así los valores y el estado del slug se
// inicializan en el montaje en vez de sincronizarse con un efecto.
export function CategoryFormDialog({ open, onOpenChange, category }: CategoryFormDialogProps) {
  const isEdit = category !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Actualiza los datos de la categoría. El slug debe seguir siendo único.'
              : 'El slug se genera a partir del nombre y puedes ajustarlo manualmente.'}
          </DialogDescription>
        </DialogHeader>

        <CategoryForm
          key={category?.id ?? 'new'}
          category={category}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
