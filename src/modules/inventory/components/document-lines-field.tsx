'use client';

import { Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { useProducts } from '@/modules/products/hooks/use-products';

import { INVENTORY_SEARCH_DEBOUNCE_MS, MAX_DOCUMENT_ITEMS_LABEL } from '../constants';
import {
  MAX_DOCUMENT_ITEMS,
  type InventoryDocumentFormValues,
} from '../schemas/inventory-document.schema';

/** Lo que el diálogo necesita saber de un producto para pintar su línea. */
export type LineProduct = { id: string; name: string; sku: string; stock: number };

type DocumentLinesFieldProps = {
  control: Control<InventoryDocumentFormValues>;
  register: UseFormRegister<InventoryDocumentFormValues>;
  errors: FieldErrors<InventoryDocumentFormValues>;
  /** Datos de presentación de los productos ya añadidos, resueltos por el diálogo. */
  products: ReadonlyMap<string, LineProduct>;
  onSelect: (product: LineProduct) => void;
  disabled?: boolean;
  /**
   * `true` solo con «Ingreso por compra» seleccionado. El campo no se pinta con ningún
   * otro tipo y lo que quedara tecleado no viaja en el cuerpo (spec 021, AC28). Lo decide
   * el diálogo, que es quien observa el tipo: este componente no conoce el catálogo.
   */
  requiresCost?: boolean;
};

const SEARCH_PAGE_SIZE = 10;

// El buscador usa `Command` **en línea** dentro del diálogo, sin `Popover`: un
// desplegable de cientos de opciones es inutilizable y el catálogo crece, pero un
// `Popover` dentro de un `Dialog` añade un componente de shadcn nuevo y una segunda capa
// de foco atrapado (D-15). La lista solo aparece mientras hay algo tecleado.
export function DocumentLinesField({
  control,
  register,
  errors,
  products,
  onSelect,
  disabled = false,
  requiresCost = false,
}: DocumentLinesFieldProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, INVENTORY_SEARCH_DEBOUNCE_MS);
  const term = debouncedSearch.trim();

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Solo productos activos: una devolución de algo ya retirado del catálogo es un
  // movimiento legítimo, pero entra por API y no por esta pantalla (§10).
  const query = useProducts({
    q: term === '' ? undefined : term,
    status: 'active',
    categoryId: 'all',
    page: 1,
    pageSize: SEARCH_PAGE_SIZE,
    sortBy: 'name',
    sortDir: 'asc',
  });

  const addedIds = new Set(fields.map((field) => field.productId));
  const isFull = fields.length >= MAX_DOCUMENT_ITEMS;

  function addProduct(product: LineProduct) {
    // Bloqueo de duplicados en el origen: repetir un SKU en el mismo documento es un
    // error de captura, y el servidor lo rechazaría con un 400 (D-15, AC8).
    if (addedIds.has(product.id) || isFull) return;

    onSelect(product);
    // `unitCost` arranca vacío y no en `'0'`: el `superRefine` del formulario solo lo
    // exige cuando el tipo es `ingreso_compra`, y un cero tecleado por nosotros pasaría
    // por un importe que nadie escribió (spec 021, AC28).
    append({ productId: product.id, quantity: '1', unitCost: '' });
    setSearch('');
  }

  // El error del array —vacío, duplicado o pasado de tope— cuelga de `items` y no de
  // ninguna línea concreta.
  const itemsError = errors.items?.root ?? errors.items;

  return (
    <div className="space-y-3">
      <Field data-invalid={Boolean(itemsError?.message)}>
        <FieldLabel htmlFor="document-product-search">Productos</FieldLabel>

        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="document-product-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar producto por nombre o SKU…"
            aria-label="Buscar un producto para añadirlo al documento"
            className="pl-9"
            disabled={disabled || isFull}
            autoComplete="off"
          />
        </div>

        {term === '' ? null : (
          // `shouldFilter={false}`: el filtrado lo hace el servidor, y dejar que `cmdk`
          // filtre otra vez escondería resultados que sí casan por SKU.
          <Command shouldFilter={false} className="rounded-md border">
            <CommandList className="max-h-48">
              {query.isPending ? (
                <div className="text-muted-foreground p-3 text-sm">Buscando…</div>
              ) : query.isError ? (
                <div className="text-destructive p-3 text-sm">
                  No se pudo buscar productos.
                </div>
              ) : (
                <>
                  <CommandEmpty>Ningún producto activo coincide.</CommandEmpty>
                  <CommandGroup>
                    {(query.data?.data ?? []).map((product) => {
                      const added = addedIds.has(product.id);

                      return (
                        <CommandItem
                          key={product.id}
                          value={product.id}
                          disabled={added}
                          onSelect={() =>
                            addProduct({
                              id: product.id,
                              name: product.name,
                              sku: product.sku,
                              stock: product.stock,
                            })
                          }
                        >
                          <span className="flex-1 truncate">{product.name}</span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {product.sku}
                          </span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {added ? 'Ya añadido' : `${product.stock} u.`}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        )}

        {isFull ? (
          <p className="text-muted-foreground text-sm">{MAX_DOCUMENT_ITEMS_LABEL}</p>
        ) : null}

        {itemsError?.message ? <FieldError errors={[itemsError]} /> : null}
      </Field>

      {fields.length === 0 ? null : (
        <ul className="divide-y rounded-md border">
          {fields.map((field, index) => {
            const product = products.get(field.productId);
            const quantityError = errors.items?.[index]?.quantity;
            const unitCostError = errors.items?.[index]?.unitCost;

            return (
              <li key={field.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product?.name ?? 'Producto'}</p>
                  <p className="text-muted-foreground text-xs">
                    <span className="font-mono">{product?.sku ?? '—'}</span>
                    {' · '}
                    {/* El stock actual a la vista: es lo que decide si una salida cabe,
                        y verlo aquí evita el 409 antes de enviar. */}
                    <span className="tabular-nums">Stock {product?.stock ?? 0}</span>
                  </p>
                </div>

                <div className="w-24 shrink-0">
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`Cantidad de ${product?.name ?? 'el producto'}`}
                    aria-invalid={Boolean(quantityError)}
                    disabled={disabled}
                    {...register(`items.${index}.quantity`)}
                  />
                  {quantityError ? <FieldError errors={[quantityError]} /> : null}
                </div>

                {/* Solo con «Ingreso por compra»: en cualquier otro tipo el costo no
                    existe como dato (spec 021, D-2) y el `superRefine` del formulario ni
                    lo exige ni lo deja pasar (AC28). El `aria-label` nombra el producto
                    porque la columna no tiene cabecera propia en la lista. */}
                {requiresCost ? (
                  <div className="w-32 shrink-0">
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Costo S/"
                      aria-label={`Costo unitario de ${product?.name ?? 'el producto'} en soles`}
                      aria-invalid={Boolean(unitCostError)}
                      disabled={disabled}
                      {...register(`items.${index}.unitCost`)}
                    />
                    {unitCostError ? <FieldError errors={[unitCostError]} /> : null}
                  </div>
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-9 shrink-0"
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  <span className="sr-only">
                    Quitar {product?.name ?? 'el producto'} del documento
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
