'use client';

import { Search } from 'lucide-react';

import { CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { formatPrice } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { CategoryArt } from './category-art';

type HeaderSearchResultsProps = {
  // Término en vivo ya recortado: es el que se ofrece en la opción de reserva, para que
  // el texto siga a lo que el visitante acaba de escribir sin esperar al debounce.
  term: string;
  // Término efectivamente consultado: el del mensaje de «sin resultados», que debe
  // nombrar lo que se buscó y no lo que se está escribiendo.
  debouncedTerm: string;
  results: CatalogProduct[];
  pending: boolean;
  errorMessage: string | null;
  onSelectProduct: (product: CatalogProduct) => void;
  onSeeAllInCatalog: () => void;
};

// Solo pinta. El debounce, la consulta y la región `aria-live` viven en `HeaderSearch`,
// que permanece montado aunque el panel se cierre.
export function HeaderSearchResults({
  term,
  debouncedTerm,
  results,
  pending,
  errorMessage,
  onSelectProduct,
  onSeeAllInCatalog,
}: HeaderSearchResultsProps) {
  return (
    <CommandList className="max-h-[min(24rem,60vh)] p-1">
      {/* Primera y no última (D-5): cmdk marca activa la primera opción tras cada
          cambio de lista, así que `Enter` sin tocar las flechas hace lo que espera
          cualquiera de un campo de búsqueda —buscar— y `↓` baja a los productos.
          Se ofrece también con 0 resultados y mientras carga: sin ningún ítem
          seleccionable, `Enter` no haría nada y el panel parecería roto (AC11). */}
      <CommandGroup>
        <CommandItem value="ver-en-catalogo" onSelect={onSeeAllInCatalog} className="gap-3 py-2.5">
          <Search className="text-primary size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[14.5px]">
            Buscar «{term}» en el catálogo
          </span>
        </CommandItem>
      </CommandGroup>

      {pending ? (
        <div className="text-nx-faint p-6 text-center text-sm">Buscando…</div>
      ) : errorMessage !== null ? (
        // El mensaje real que propaga el interceptor de axios, no un texto
        // genérico: si la API responde 400 por un parámetro, hay que poder leerlo.
        <div className="text-destructive p-6 text-center text-sm">{errorMessage}</div>
      ) : results.length === 0 ? (
        <div className="text-nx-faint p-6 text-center text-sm">
          No hay productos que coincidan con «{debouncedTerm}».
        </div>
      ) : (
        <CommandGroup heading="Productos">
          {results.map((product) => (
            <CommandItem
              key={product.id}
              value={product.id}
              onSelect={() => onSelectProduct(product)}
              className="gap-3"
            >
              <span className="nx-art-surface grid size-11 shrink-0 place-items-center rounded-lg p-1.5">
                <CategoryArt categorySlug={product.categorySlug} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{product.name}</span>
                <span className="text-nx-faint block truncate text-xs">{product.categoryName}</span>
              </span>
              <span className="font-nx-display shrink-0 text-[14.5px] font-semibold">
                {formatPrice(product.priceCents)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandList>
  );
}
