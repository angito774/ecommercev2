'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CatalogCategory } from '@/modules/categories/types/catalog-category.types';
import type { StockLevel } from '@/modules/products/types/catalog.types';

import { STOCK_LABELS } from '../constants';

// Solo dos de los tres niveles: «Agotado» no es un filtro que nadie quiera activar,
// y las etiquetas salen de `STOCK_LABELS` para no escribir por tercera vez los
// mismos textos que ya usan la tarjeta y la ficha.
const AVAILABILITY_OPTIONS = [
  { value: 'in', label: STOCK_LABELS.in },
  { value: 'low', label: STOCK_LABELS.low },
] as const satisfies ReadonlyArray<{ value: StockLevel; label: string }>;

type CatalogSidebarProps = {
  categories: CatalogCategory[];
  activeCategory: string;
  onCategoryChange: (slug: string) => void;
  // Niveles de stock activos. Vacío significa «sin filtrar», no «ninguno»: es la
  // lectura que espera cualquiera que no marque nada.
  availability: StockLevel[];
  onAvailabilityToggle: (level: StockLevel) => void;
};

// Sidebar del catálogo, solo a partir de 1024 px. Bajo ese ancho la sección
// conserva los chips horizontales: apilar tres bloques colapsables encima de la
// rejilla empujaría los productos fuera de la primera pantalla en móvil.
export function CatalogSidebar({
  categories,
  activeCategory,
  onCategoryChange,
  availability,
  onAvailabilityToggle,
}: CatalogSidebarProps) {
  const totalProducts = categories.reduce((sum, item) => sum + item.productCount, 0);

  return (
    <aside className="hidden lg:block" aria-label="Filtros del catálogo">
      {/* La posición pegajosa se calcula desde `--nx-header-h` y no con un `top-24`
          fijo: el header de dos filas mide 109 px en escritorio, así que 96 px
          dejaban la cabecera del sidebar debajo del header al hacer scroll. */}
      <div className="sticky top-[calc(var(--nx-header-h)+1rem)] flex flex-col gap-1">
        <FilterGroup title="Categorías">
          <ul className="flex flex-col gap-0.5">
            <li>
              <CategoryRow
                active={activeCategory === 'all'}
                label="Todo"
                count={totalProducts}
                onClick={() => onCategoryChange('all')}
              />
            </li>
            {categories.map((item) => (
              <li key={item.id}>
                <CategoryRow
                  active={activeCategory === item.slug}
                  label={item.name}
                  count={item.productCount}
                  onClick={() => onCategoryChange(item.slug)}
                />
              </li>
            ))}
          </ul>
        </FilterGroup>

        <FilterGroup title="Disponibilidad">
          <div className="flex flex-col gap-1">
            {AVAILABILITY_OPTIONS.map((option) => {
              const id = `disponibilidad-${option.value}`;
              return (
                // 44 px de alto en la fila entera: el objetivo táctil es la fila,
                // no la caja de 16 px de Radix.
                <div key={option.value} className="flex h-11 items-center gap-2.5">
                  <Checkbox
                    id={id}
                    checked={availability.includes(option.value)}
                    onCheckedChange={() => onAvailabilityToggle(option.value)}
                  />
                  <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
                    {option.label}
                  </Label>
                </div>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup title="Precio">
          {/* Placeholder declarado y no un control muerto: el rango de precio
              necesita un parámetro que `catalogQuerySchema` no tiene, así que
              pintarlo operativo prometería un filtro que el servidor ignora. */}
          <p className="text-muted-foreground text-sm">Próximamente</p>
        </FilterGroup>
      </div>
    </aside>
  );
}

// `<details>`/`<summary>` nativos en vez del `accordion` de shadcn: colapsan sin
// JavaScript, ya son accesibles por teclado de serie y evitan añadir otro
// componente de Radix al bundle por tres bloques estáticos.
function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="group border-border border-b py-1 last:border-b-0">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        {/* `group-[[open]]` y no `group-open`: la variante `open` de Tailwind no
            tiene forma de grupo, y con `group-open:` no se genera ninguna regla —
            el chevron se quedaba apuntando siempre hacia abajo. La arbitraria
            compila a `.group[open] &`, que es el selector que hace falta. */}
        <ChevronDown
          className="text-muted-foreground size-4 transition-transform group-[[open]]:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="pt-1 pb-3">{children}</div>
    </details>
  );
}

function CategoryRow({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // `aria-pressed` y no `aria-current`: son botones que refiltran una rejilla,
      // no enlaces a otra vista, y es el mismo patrón que ya usan los chips.
      aria-pressed={active}
      className={`flex h-11 w-full items-center justify-between gap-2 rounded-full px-3.5 text-left text-sm transition-colors ${
        active
          ? 'bg-secondary text-foreground font-semibold'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-nx-faint shrink-0 text-xs tabular-nums">{count}</span>
    </button>
  );
}
