'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { CATALOG_STALE_TIME_MS, catalogKeys } from '../constants';
import type { CatalogQueryInput } from '../schemas/catalog.schema';
import { fetchCatalogProducts } from '../services/catalog.service';
import type { CatalogProductListResponse } from '../types/catalog.types';

type UseCatalogProductsOptions = {
  // Lo que el Server Component ya leyó del repositorio para estos mismos
  // parámetros. Con él, hidratar no dispara una segunda petición idéntica y se
  // evita la cascada render → fetch → render (AC8, spec 004 D-5).
  initialData?: CatalogProductListResponse;
  enabled?: boolean;
};

export function useCatalogProducts(
  params: CatalogQueryInput,
  { initialData, enabled }: UseCatalogProductsOptions = {},
) {
  return useQuery({
    queryKey: catalogKeys.list(params),
    queryFn: () => fetchCatalogProducts(params),
    initialData,
    enabled,
    // Explícito y no heredado del default global: AC8 depende de que los datos
    // sembrados por el servidor nazcan frescos. Con `staleTime: 0` React Query los
    // marcaría rancios al instante y refetchearía al montar, que es exactamente lo
    // que `initialData` viene a evitar.
    staleTime: CATALOG_STALE_TIME_MS,
    // Sin esto la rejilla se vacía en cada cambio de filtro y la altura de la
    // sección colapsa; con los datos previos solo se marca como `isFetching` (AC7).
    placeholderData: keepPreviousData,
  });
}
