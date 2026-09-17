'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
} from '@tanstack/react-table';
import { Search } from 'lucide-react';
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

import {
  EMPLOYEE_PAGE_SIZE,
  EMPTY_EMPLOYEES_MESSAGE,
  EMPTY_EMPLOYEES_TITLE,
  NO_EMPLOYEE_RESULTS_MESSAGE,
  NO_EMPLOYEE_RESULTS_TITLE,
  PAYROLL_SEARCH_DEBOUNCE_MS,
} from '../constants';
import { useEmployees } from '../hooks/use-employees';
import type { EmployeeQueryParams } from '../schemas/employee.schema';
import type { EmployeeRow } from '../types/employee.types';

import { DeactivateEmployeeDialog } from './deactivate-employee-dialog';
import { EmployeeFormDialog } from './employee-form-dialog';
import { getEmployeeColumns } from './employee-columns';
import { RegisterPaymentDialog } from './register-payment-dialog';

const NO_ROWS: EmployeeRow[] = [];

type StatusFilter = EmployeeQueryParams['status'];

// El default es `active` y no `all`: los ex empleados se acumulan para siempre y nunca
// son la respuesta a «a quién le toca cobrar» (D-14).
const STATUS_OPTIONS = [
  { value: 'active', label: 'En plantilla' },
  { value: 'inactive', label: 'Dados de baja' },
  { value: 'all', label: 'Todos' },
] as const satisfies ReadonlyArray<{ value: StatusFilter; label: string }>;

export function EmployeesTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<EmployeeRow | null>(null);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paying, setPaying] = useState<EmployeeRow | null>(null);

  const debouncedSearch = useDebounce(search, PAYROLL_SEARCH_DEBOUNCE_MS);

  // Sin este reinicio, filtrar desde la página 3 devuelve un listado vacío que parece un
  // fallo.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const params: EmployeeQueryParams = useMemo(
    () => ({
      search: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      status,
      page,
      pageSize: EMPLOYEE_PAGE_SIZE,
    }),
    [debouncedSearch, status, page],
  );

  const query = useEmployees(params);

  // Permiso resuelto por el servidor. Mientras carga no se ofrece ninguna acción: es
  // preferible a pintar un botón que luego desaparece (AC3).
  const canManage = query.data?.meta.canManage ?? false;

  const columns = useMemo(
    () =>
      getEmployeeColumns({
        canManage,
        onEdit: (employee) => {
          setEditing(employee);
          setFormOpen(true);
        },
        onDeactivate: (employee) => {
          setDeactivating(employee);
          setDeactivateOpen(true);
        },
        onRegisterPayment: (employee) => {
          setPaying(employee);
          setPaymentOpen(true);
        },
      }),
    [canManage],
  );

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: EMPLOYEE_PAGE_SIZE };

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

  const hasFilters = params.search !== undefined || status !== 'active';

  function clearFilters() {
    setSearch('');
    setStatus('active');
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  // Los dos estados vacíos dicen cosas distintas: sin filtros, cero filas es que la
  // planilla está sin estrenar y lo que toca es el botón de alta; con filtros, es que la
  // búsqueda no casó (AC19).
  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">{NO_EMPLOYEE_RESULTS_TITLE}</p>
      <p className="text-muted-foreground text-sm">{NO_EMPLOYEE_RESULTS_MESSAGE}</p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">{EMPTY_EMPLOYEES_TITLE}</p>
      <p className="text-muted-foreground text-sm">{EMPTY_EMPLOYEES_MESSAGE}</p>
      {canManage ? (
        <Button size="sm" onClick={openCreate}>
          Dar de alta al primero
        </Button>
      ) : null}
    </>
  );

  const statusLabel = STATUS_OPTIONS.find((option) => option.value === status)?.label;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o código…"
            aria-label="Buscar en la planilla por nombre, apellido o código"
            className="pl-9"
          />
        </div>

        <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <SelectTrigger className="sm:w-48" aria-label="Filtrar el personal por estado">
            {/* Texto explícito: `SelectValue` depende de que el item esté montado y el
                contenido solo se monta al abrir el desplegable. */}
            <SelectValue>{statusLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canManage ? (
          <Button className="sm:ml-auto" onClick={openCreate}>
            Dar de alta
          </Button>
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

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          // Al cerrar se olvida qué se editaba: si no, reabrir con «Dar de alta»
          // mostraría la última ficha editada.
          if (!open) setEditing(null);
        }}
        employee={editing}
      />

      <DeactivateEmployeeDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        employee={deactivating}
      />

      <RegisterPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        employee={paying}
      />
    </div>
  );
}
