'use client';

import { useState } from 'react';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useDebounce } from '@/hooks/use-debounce';
import { CATALOG_SEARCH_LIMIT, SEARCH_DEBOUNCE_MS } from '@/modules/products/constants';
import { useCatalogProducts } from '@/modules/products/hooks/use-catalog-products';
import { formatPrice } from '@/modules/products/lib/price';

import { useUiStore } from '../store/ui.store';
import { CategoryArt } from './category-art';

// Sobre `Command` (cmdk) y no un overlay a mano: trae de serie lo caro de acertar
// —rol combobox, `aria-activedescendant`, navegación con ↑ ↓ y Enter, trampa de
// foco y devolución del foco al disparador al cerrar— que es justo lo que pide
// AC10 (spec 004, D-12).
export function SearchDialog() {
  const open = useUiStore((state) => state.searchOpen);
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);

  // Cierre del overlay, por `Esc`, por clic fuera o por elegir un resultado.
  //
  // Radix devuelve el foco solo cuando el disparador y el contenido están unidos de
  // forma nativa por `Dialog.Trigger`. Aquí el diálogo se monta ya abierto (pestillo
  // de carga diferida, I-5), así que Radix nunca registró quién tenía el foco y este
  // acababa en el `<body>`. Se restaura a mano sobre el disparador que abrió el
  // overlay, en el frame siguiente para no pelearse con la limpieza de Radix.
  const handleOpenChange = (next: boolean) => {
    setSearchOpen(next);
    if (next) return;

    const trigger = useUiStore.getState().searchTrigger;
    // `preventScroll` porque al elegir un resultado se desplaza al catálogo: sin
    // él, enfocar el botón del header devolvería la página arriba del todo.
    requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
  };

  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounce(term.trim(), SEARCH_DEBOUNCE_MS);

  // Contra la API y no filtrando el array ya cargado: el cliente solo tiene la
  // primera página, así que buscar en ella daría "sin resultados" para productos
  // que sí existen (spec 004, D-13).
  const query = useCatalogProducts(
    { q: debouncedTerm, page: 1, pageSize: CATALOG_SEARCH_LIMIT, sort: 'featured' },
    { enabled: open && debouncedTerm.length > 0 },
  );

  const results = debouncedTerm.length > 0 ? (query.data?.data ?? []) : [];

  const onSelect = (categorySlug: string) => {
    // Sin ficha de producto todavía (§3), así que el resultado lleva al catálogo
    // filtrado por su categoría, que es lo más cerca que se puede dejar al
    // visitante del producto que buscaba.
    setCategoryFilter(categorySlug);
    // Por el mismo camino que `Esc` y el clic fuera, para que elegir un resultado
    // tampoco deje el foco en el `<body>`.
    handleOpenChange(false);
    setTerm('');
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Buscar productos"
      description="Busca en el catálogo por nombre de producto"
    >
      {/* `CommandDialog` de este shadcn no envuelve a sus hijos en `Command`, así
          que el contenedor lo pone el consumidor. `shouldFilter={false}` porque el
          filtrado lo hace Postgres con `ilike`: si cmdk volviera a filtrar por su
          cuenta descartaría resultados que el servidor sí considera coincidencias. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Busca portátiles, monitores, SSD…"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
        {debouncedTerm.length === 0 ? (
          <div className="text-nx-faint p-6 text-center text-sm">
            Escribe para buscar en el catálogo.
          </div>
        ) : query.isFetching && results.length === 0 ? (
          <div className="text-nx-faint p-6 text-center text-sm">Buscando…</div>
        ) : query.isError ? (
          <div className="text-destructive p-6 text-center text-sm">
            {query.error.message}
          </div>
        ) : (
          <>
            <CommandEmpty>No hay productos que coincidan con «{debouncedTerm}».</CommandEmpty>
            {results.length > 0 ? (
              <CommandGroup heading="Productos">
                {results.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.id}
                    onSelect={() => onSelect(product.categorySlug)}
                    className="gap-3"
                  >
                    <span className="nx-art-surface grid size-11 shrink-0 place-items-center rounded-lg p-1.5">
                      <CategoryArt categorySlug={product.categorySlug} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">
                        {product.name}
                      </span>
                      <span className="text-nx-faint block truncate text-xs">
                        {product.categoryName}
                      </span>
                    </span>
                    <span className="font-nx-display shrink-0 text-[14.5px] font-semibold">
                      {formatPrice(product.priceCents)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </>
        )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
