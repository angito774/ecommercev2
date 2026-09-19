'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
} from '@tanstack/react-table';
import { ArrowDownToLine, ArrowUpFromLine, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';
import type { TransactionDirection } from '@/lib/inventory-transactions';

import {
  DIRECTION_FILTER_OPTIONS,
  EMPTY_DOCUMENTS_MESSAGE,
  EMPTY_DOCUMENTS_TITLE,
  INVENTORY_DOCUMENTS_PAGE_SIZE,
  INVENTORY_SEARCH_DEBOUNCE_MS,
  NO_DOCUMENT_RESULTS_MESSAGE,
  NO_DOCUMENT_RESULTS_TITLE,
} from '../constants';
import { useInventoryDocuments } from '../hooks/use-inventory-documents';
import type { InventoryDocumentQueryParams } from '../schemas/inventory-document.schema';
import type { InventoryDocumentRow } from '../types/inventory-document.types';

import { getInventoryDocumentColumns } from './inventory-document-columns';
import { InventoryDocumentDetailDialog } from './inventory-document-detail-dialog';
import { InventoryDocumentDialog } from './inventory-document-dialog';

const NO_ROWS: InventoryDocumentRow[] = [];
const ALL_DIRECTIONS = 'all';

type DirectionFilter = InventoryDocumentQueryParams['direction'];

export function InventoryDocumentsTable() {
  const [direction, setDirection] = useState<DirectionFilter>(ALL_DIRECTIONS);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [noteDirection, setNoteDirection] = useState<TransactionDirection>('ingreso');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, INVENTORY_SEARCH_DEBOUNCE_MS);

  // Sin este reinicio, filtrar desde la página 3 devuelve un listado vacío que parece un
  // fallo.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, direction, from, to]);

  const params: InventoryDocumentQueryParams = useMemo(
    () => ({
      direction,
      // El `<input type="date">` entrega '' cuando está vacío; la query espera que el
      // parámetro no viaje, así que la traducción ocurre en un solo sitio.
      from: from === '' ? undefined : from,
      to: to === '' ? undefined : to,
      search: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      page,
      pageSize: INVENTORY_DOCUMENTS_PAGE_SIZE,
    }),
    [direction, from, to, debouncedSearch, page],
  );

  const query = useInventoryDocuments(params);

  // Permiso resuelto por el servidor. Mientras carga no se ofrece ninguna acción: es
  // preferible a pintar un botón que luego desaparece (AC3).
  const canMove = query.data?.meta.canMove ?? false;

  const columns = useMemo(
    () =>
      getInventoryDocumentColumns({
        onView: (document) => {
          setDetailId(document.id);
          setDetailOpen(true);
        },
      }),
    [],
  );

  const pagination: PaginationState = {
    pageIndex: page - 1,
    pageSize: INVENTORY_DOCUMENTS_PAGE_SIZE,
  };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPage(next.pageIndex + 1);
  };

  const table = useReactTable({
    data: query.data?.data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    rowCount: query.data?.meta.total ?? 0,
    state: { pagination },
    onPaginationChange,
  });

  const hasFilters =
    direction !== ALL_DIRECTIONS || from !== '' || to !== '' || params.search !== undefined;

  function clearFilters() {
    setDirection(ALL_DIRECTIONS);
    setFrom('');
    setTo('');
    setSearch('');
  }

  function openNote(value: TransactionDirection) {
    setNoteDirection(value);
    setFormOpen(true);
  }

  const directionLabel = DIRECTION_FILTER_OPTIONS.find(
    (option) => option.value === direction,
  )?.label;

  // Sin filtros, cero documentos es que todavía no se registró ninguno y hay que explicar
  // cómo; con filtros, que la búsqueda no casó (AC17).
  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">{NO_DOCUMENT_RESULTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{NO_DOCUMENT_RESULTS_MESSAGE}</p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">{EMPTY_DOCUMENTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{EMPTY_DOCUMENTS_MESSAGE}</p>
      {canMove ? (
        <Button variant="outline" size="sm" onClick={() => openNote('ingreso')}>
          Registrar una nota de ingreso
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:max-w-xs lg:flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por documento de referencia…"
            aria-label="Buscar documentos por su documento de referencia"
            className="pl-9"
          />
        </div>

        <Select
          value={direction}
          onValueChange={(value) => setDirection(value as DirectionFilter)}
        >
          <SelectTrigger className="lg:w-48" aria-label="Filtrar por dirección del movimiento">
            {/* Texto explícito: SelectValue depende de que el item esté montado y el
                contenido solo se monta al abrir el desplegable. */}
            <SelectValue>{directionLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DIRECTION_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            aria-label="Desde el día"
            className="lg:w-40"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            aria-label="Hasta el día"
            className="lg:w-40"
          />
        </div>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        ) : null}

        {/* Los dos botones solo con `inventory.move`. La frontera real es el 403 del
            POST: esto solo evita ofrecer lo que no se puede hacer (AC3). */}
        {canMove ? (
          <div className="flex items-center gap-2 lg:ml-auto">
            <Button size="sm" variant="outline" onClick={() => openNote('ingreso')}>
              <ArrowDownToLine aria-hidden />
              Nota de ingreso
            </Button>
            <Button size="sm" onClick={() => openNote('salida')}>
              <ArrowUpFromLine aria-hidden />
              Nota de salida
            </Button>
          </div>
        ) : null}
      </div>

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />

      <InventoryDocumentDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        direction={noteDirection}
      />

      <InventoryDocumentDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        documentId={detailId}
      />
    </div>
  );
}
