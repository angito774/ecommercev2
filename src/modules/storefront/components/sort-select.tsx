'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CatalogQueryParams } from '@/modules/products/schemas/catalog.schema';

type CatalogSort = CatalogQueryParams['sort'];

// Las cuatro opciones son exactamente el `z.enum` de `catalogQuerySchema`. El
// `satisfies` es lo que ata las dos listas: añadir un orden al schema sin añadirlo
// aquí no rompe, pero escribir aquí un valor que el schema no acepta sí deja de
// compilar, y ese es el error que llegaría al servidor como un 400.
const SORT_OPTIONS = [
  { value: 'featured', label: 'Relevancia' },
  { value: 'newest', label: 'Más recientes' },
  { value: 'price_asc', label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
] as const satisfies ReadonlyArray<{ value: CatalogSort; label: string }>;

// Radix entrega el valor como `string`. Se estrecha con un predicado y no con un
// `as CatalogSort`: el cast mentiría si algún día el DOM devolviera otra cosa,
// mientras que esto simplemente ignora lo que no es una opción válida.
function isCatalogSort(value: string): value is CatalogSort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

type SortSelectProps = {
  value: CatalogSort;
  onChange: (sort: CatalogSort) => void;
};

export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (isCatalogSort(next)) onChange(next);
      }}
    >
      {/* `aria-label` y no un `<label>` visible: el propio valor seleccionado
          («Relevancia») ya dice qué hace el control, y una etiqueta encima
          añadiría una línea a una fila que compite por el ancho con el contador. */}
      <SelectTrigger
        aria-label="Ordenar el catálogo"
        className="border-border bg-card h-11 w-full rounded-full sm:w-[15.5rem]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
