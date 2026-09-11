'use client';

import { PackageOpen, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CatalogCategory } from '@/modules/categories/types/catalog-category.types';
import { CATALOG_PAGE_SIZE } from '@/modules/products/constants';
import { useCatalogProducts } from '@/modules/products/hooks/use-catalog-products';
import type {
  CatalogProductListResponse,
  StockLevel,
} from '@/modules/products/types/catalog.types';

import { scrollBehavior } from '../lib/motion';
import { useUiStore } from '../store/ui.store';
import { CatalogPagination } from './catalog-pagination';
import { CatalogSidebar } from './catalog-sidebar';
import { ProductCard } from './product-card';
import { Eyebrow } from './section-heading';
import { SortSelect } from './sort-select';

type CatalogSectionProps = {
  categories: CatalogCategory[];
  // Exactamente lo que el servidor ya leyó para el filtro inicial. Va al hook como
  // `initialData` para que hidratar no dispare una segunda petición idéntica (AC8).
  initialData: CatalogProductListResponse;
};

export function CatalogSection({ categories, initialData }: CatalogSectionProps) {
  const category = useUiStore((state) => state.categoryFilter);
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);
  // El término lo pone el ítem de reserva del buscador. Vive en el store y no aquí
  // porque quien lo aplica está en otro punto del árbol —el overlay— y puede
  // aplicarlo desde otra página (spec 005, D-10).
  const catalogQuery = useUiStore((state) => state.catalogQuery);
  const setCatalogQuery = useUiStore((state) => state.setCatalogQuery);
  const sort = useUiStore((state) => state.catalogSort);
  const setCatalogSort = useUiStore((state) => state.setCatalogSort);
  const page = useUiStore((state) => state.catalogPage);
  const setCatalogPage = useUiStore((state) => state.setCatalogPage);

  // Filtro de disponibilidad. Es estado local y no del store porque solo lo leen
  // esta sección y su sidebar: nadie lo cambia desde otro punto del árbol, que es
  // lo que justificaba subir los otros cuatro a Zustand.
  const [availability, setAvailability] = useState<StockLevel[]>([]);
  const sectionRef = useRef<HTMLElement>(null);

  // `undefined` y no cadena vacía: `q: ''` sería una clave de caché distinta de la
  // del catálogo sin filtro y provocaría una petición extra por el mismo resultado.
  const params = {
    q: catalogQuery || undefined,
    category,
    sort,
    page,
    pageSize: CATALOG_PAGE_SIZE,
  };

  // La guarda cubre los CUATRO parámetros que el Server Component sembró, no solo
  // categoría y término: `page.tsx` lee `sort: 'featured'` y `page: 1`. Con dos
  // términos, elegir «Precio: menor a mayor» estrenaría la clave `price_asc` con
  // la respuesta de `featured` —datos de otra consulta servidos como propios— y
  // ordenar volvería a la página 1 mostrando el orden anterior (spec 004, AC8).
  const isSeededQuery =
    category === 'all' && catalogQuery === '' && sort === 'featured' && page === 1;

  const query = useCatalogProducts(params, {
    initialData: isSeededQuery ? initialData : undefined,
  });

  const products = query.data?.data ?? [];
  const meta = query.data?.meta;

  // El filtro se aplica en cliente sobre la página cargada: `catalogQuerySchema` no
  // tiene parámetro de stock y el alcance de este spec no toca el endpoint. Por eso
  // el contador de arriba sigue diciendo el total del servidor y no «N en stock»:
  // afirmar eso sería mentir en cuanto haya una segunda página.
  const visibleProducts =
    availability.length === 0
      ? products
      : products.filter((product) => availability.includes(product.stockLevel));

  const onPageChange = (next: number) => {
    setCatalogPage(next);
    // Sin esto, cambiar de página desde el pie deja al visitante mirando la
    // paginación de una rejilla que ya cambió por encima de su viewport.
    sectionRef.current?.scrollIntoView({
      behavior: scrollBehavior(),
      block: 'start',
    });
  };

  const onAvailabilityToggle = (level: StockLevel) => {
    setAvailability((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level],
    );
  };

  const emptyTitle = catalogQuery
    ? `No hay productos que coincidan con «${catalogQuery}»`
    : availability.length > 0 && products.length > 0
      ? 'Ningún producto de esta página cumple el filtro de disponibilidad'
      : 'No hay productos en esta categoría';

  return (
    <section
      ref={sectionRef}
      id="catalogo"
      // Sobre `--nx-header-h`: el header de dos filas mide 109 px en escritorio y un
      // `scroll-mt-24` fijo dejaba el encabezado del catálogo bajo la cabecera al
      // llegar por el ancla o al paginar.
      className="scroll-mt-[calc(var(--nx-header-h)+1.5rem)] py-[clamp(3.75rem,8.5vw,7.25rem)]"
    >
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="mb-[clamp(2rem,4vw,3.25rem)]">
          <Eyebrow>Catálogo</Eyebrow>
          <h2 className="text-[clamp(1.875rem,4.3vw,3.125rem)] font-semibold">
            Lo mejor de cada categoría
          </h2>
        </div>

        {/* Dos columnas a partir de 1024 px; por debajo, una sola y el sidebar no
            se renderiza (se oculta a sí mismo), quedando los chips horizontales. */}
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <CatalogSidebar
            categories={categories}
            activeCategory={category}
            onCategoryChange={setCategoryFilter}
            availability={availability}
            onAvailabilityToggle={onAvailabilityToggle}
          />

          <div className="min-w-0">
            {/* Fila de filtros: scroll horizontal con scroll-snap en móvil, sin
                envolver a varias líneas. `role="tablist"` no encaja porque no hay
                paneles hermanos; son botones que refiltran una misma rejilla.
                A partir de 1024 px el sidebar hace este trabajo y la fila sobra. */}
            <div
              className="-mx-[clamp(1rem,4vw,2rem)] mb-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-[clamp(1rem,4vw,2rem)] pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
              aria-label="Filtrar por categoría"
            >
              <FilterChip
                active={category === 'all'}
                onClick={() => setCategoryFilter('all')}
                label="Todo"
              />
              {categories.map((item) => (
                <FilterChip
                  key={item.id}
                  active={category === item.slug}
                  onClick={() => setCategoryFilter(item.slug)}
                  label={item.name}
                />
              ))}
            </div>

            {/* El término aplicado se ve y se puede quitar. Sin este chip, la rejilla
                mostraría un subconjunto del catálogo sin decir por qué (AC18). */}
            {catalogQuery ? (
              <div className="mb-5 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Resultados de</span>
                <button
                  type="button"
                  onClick={() => setCatalogQuery('')}
                  className="border-nx-line bg-card hover:text-foreground text-muted-foreground inline-flex h-11 items-center gap-2 rounded-full border pr-3 pl-4 font-medium transition-colors"
                  aria-label={`Quitar el filtro «${catalogQuery}»`}
                >
                  «{catalogQuery}»
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}

            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              {/* La región viva envuelve al skeleton y al contador, y no arranca con
                  el texto: si `aria-live` se montara junto al resultado, el lector de
                  pantalla no tendría región previa que comparar y la primera carga
                  no se anunciaría. El skeleton, además, evita que la línea empuje la
                  rejilla al aparecer. */}
              <div className="text-muted-foreground text-sm" aria-live="polite">
                {query.isPending ? (
                  <Skeleton className="h-5 w-44 rounded-full" />
                ) : (
                  <p>
                    <span className="text-foreground font-semibold tabular-nums">
                      {meta?.total ?? 0}
                    </span>{' '}
                    {meta?.total === 1 ? 'producto encontrado' : 'productos encontrados'}
                  </p>
                )}
              </div>
              <SortSelect value={sort} onChange={setCatalogSort} />
            </div>

            <CatalogBody
              isPending={query.isPending}
              isError={query.isError}
              error={query.error}
              onRetry={() => void query.refetch()}
              products={visibleProducts}
              isFetching={query.isFetching}
              emptyTitle={emptyTitle}
            />

            {query.isPending || query.isError ? null : (
              <CatalogPagination
                page={meta?.page ?? 1}
                totalPages={meta?.totalPages ?? 1}
                onChange={onPageChange}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CatalogBody({
  isPending,
  isError,
  error,
  onRetry,
  products,
  isFetching,
  emptyTitle,
}: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  onRetry: () => void;
  products: CatalogProductListResponse['data'];
  isFetching: boolean;
  // El título del estado vacío lo decide quien conoce los filtros aplicados. Aquí
  // llega ya resuelto para no arrastrar término, disponibilidad y categoría a un
  // componente cuya única responsabilidad es pintar la rejilla.
  emptyTitle: string;
}) {
  if (isPending) {
    return (
      // Bajo 400 px la rejilla es de una columna y la tarjeta va tumbada (AC12): el
      // esqueleto copia las dos cosas para que no haya salto de layout al resolver.
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:gap-5">
        {Array.from({ length: CATALOG_PAGE_SIZE }, (_, index) => (
          <Skeleton
            key={index}
            className="h-[136px] rounded-[22px] min-[400px]:h-[340px]"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[22px] border p-14 text-center">
        <TriangleAlert className="text-destructive size-8" aria-hidden />
        <h3 className="text-lg font-semibold">No se pudo cargar el catálogo</h3>
        {/* El mensaje real del servidor, no uno genérico: el interceptor de axios ya
            lo dejó legible y ocultarlo solo dificulta el diagnóstico. */}
        <p className="text-muted-foreground max-w-prose text-sm">
          {error?.message ?? 'Inténtalo de nuevo en unos segundos.'}
        </p>
        <Button onClick={onRetry} variant="outline" className="mt-2 h-11 rounded-full px-5">
          <RefreshCw className="size-4" aria-hidden />
          Reintentar
        </Button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="border-border bg-card flex flex-col items-center gap-3 rounded-[22px] border p-14 text-center">
        <PackageOpen className="text-nx-faint size-8" aria-hidden />
        <h3 className="text-lg font-semibold">{emptyTitle}</h3>
        <p className="text-muted-foreground text-sm">Prueba con otro filtro del catálogo.</p>
      </div>
    );
  }

  return (
    // `placeholderData` mantiene la rejilla anterior mientras llega la nueva, así
    // que la altura no colapsa; la opacidad es la única señal de que está cargando
    // y no hay salto de layout (AC7).
    <div
      aria-busy={isFetching}
      // `grid-cols-1` bajo 400 px: sin esto, la tarjeta tumbada de AC12 se quedaría
      // en dos columnas de 180 px, que es justo lo que el cambio venía a arreglar.
      className={`grid grid-cols-1 gap-3 transition-opacity min-[400px]:grid-cols-2 lg:grid-cols-3 xl:gap-5 ${
        isFetching ? 'opacity-60' : 'opacity-100'
      }`}
    >
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 4} />
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // 44 px de alto: objetivo táctil mínimo de AC17.
      className={`h-11 shrink-0 snap-start rounded-full border px-4 text-[13.5px] font-medium transition-colors ${
        active
          ? 'bg-foreground text-background border-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-nx-line hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}
