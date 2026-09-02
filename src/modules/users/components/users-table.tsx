'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { Search, UserPlus } from 'lucide-react';
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
  DEFAULT_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  USER_ROLE_OPTIONS,
  USER_STATUS_OPTIONS,
} from '../constants';
import { useUsers } from '../hooks/use-users';
import type { UserQueryParams } from '../schemas/user.schema';
import type { UserWithRoles } from '../types/user.types';

import { AssignRolesDialog } from './assign-roles-dialog';
import { InviteUserDialog } from './invite-user-dialog';
import { ToggleUserActiveDialog } from './toggle-user-active-dialog';
import { getUserColumns } from './user-columns';

type UserStatus = UserQueryParams['status'];
type UserRoleFilter = UserQueryParams['role'];
type UserSortBy = UserQueryParams['sortBy'];

const SORTABLE_COLUMNS: readonly UserSortBy[] = ['email', 'createdAt'];
const DEFAULT_SORTING: SortingState = [{ id: 'createdAt', desc: true }];
const NO_ROWS: UserWithRoles[] = [];

function isSortableColumn(id: string): id is UserSortBy {
  return (SORTABLE_COLUMNS as readonly string[]).includes(id);
}

export function UsersTable() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus>('all');
  const [role, setRole] = useState<UserRoleFilter>('all');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [assigning, setAssigning] = useState<UserWithRoles | null>(null);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [toggling, setToggling] = useState<UserWithRoles | null>(null);

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  // Sin este reinicio, filtrar desde la página 3 devuelve un listado vacío que
  // parece un fallo.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, role]);

  const [activeSort] = sorting;
  const sortBy = activeSort && isSortableColumn(activeSort.id) ? activeSort.id : 'createdAt';
  const sortDir = activeSort?.desc === false ? 'asc' : 'desc';

  const params: UserQueryParams = useMemo(
    () => ({
      q: debouncedSearch.trim() === '' ? undefined : debouncedSearch.trim(),
      status,
      role,
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      sortBy,
      sortDir,
    }),
    [debouncedSearch, status, role, page, sortBy, sortDir],
  );

  const query = useUsers(params);

  const hasFilters = params.q !== undefined || status !== 'all' || role !== 'all';
  const statusLabel = USER_STATUS_OPTIONS.find((option) => option.value === status)?.label;
  const roleLabelText = USER_ROLE_OPTIONS.find((option) => option.value === role)?.label;

  // Permisos e identidad resueltos por el servidor: mientras el listado carga, la
  // fila propia no se puede identificar y por eso no hay controles que deshabilitar.
  const currentUserId = query.data?.meta.currentUserId ?? '';
  const canAssignElevatedRoles = query.data?.meta.canAssignElevatedRoles ?? false;

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setRole('all');
  }

  const columns = useMemo(
    () =>
      getUserColumns({
        currentUserId,
        onAssignRoles: (user) => {
          setAssigning(user);
          setRolesOpen(true);
        },
        onToggleActive: (user) => {
          setToggling(user);
          setToggleOpen(true);
        },
      }),
    [currentUserId],
  );

  const pagination: PaginationState = { pageIndex: page - 1, pageSize: DEFAULT_PAGE_SIZE };

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPage(next.pageIndex + 1);
  };

  const table = useReactTable({
    data: query.data?.data ?? NO_ROWS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: query.data?.meta.total ?? 0,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange,
  });

  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">Sin resultados</p>
      <p className="text-muted-foreground text-sm">
        Nadie coincide con la búsqueda o los filtros aplicados.
      </p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">Todavía no hay nadie registrado</p>
      <p className="text-muted-foreground text-sm">
        Invita a la primera persona por correo para darle acceso al panel.
      </p>
      <Button size="sm" onClick={() => setInviteOpen(true)}>
        <UserPlus className="size-4" aria-hidden />
        Invitar persona
      </Button>
    </>
  );

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
            placeholder="Buscar por correo o nombre…"
            aria-label="Buscar personas por correo o nombre"
            className="pl-9"
          />
        </div>

        <Select value={status} onValueChange={(value) => setStatus(value as UserStatus)}>
          <SelectTrigger className="sm:w-40" aria-label="Filtrar por estado">
            {/* Texto explícito: SelectValue depende de que el item esté montado y el
                contenido solo se monta al abrir el desplegable. */}
            <SelectValue>{statusLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {USER_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={role} onValueChange={(value) => setRole(value as UserRoleFilter)}>
          <SelectTrigger className="sm:w-48" aria-label="Filtrar por rol">
            <SelectValue>{roleLabelText}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {USER_ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button className="sm:ml-auto" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" aria-hidden />
          Invitar persona
        </Button>
      </div>

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        canAssignElevatedRoles={canAssignElevatedRoles}
      />
      <AssignRolesDialog
        open={rolesOpen}
        onOpenChange={setRolesOpen}
        user={assigning}
        canAssignElevatedRoles={canAssignElevatedRoles}
      />
      <ToggleUserActiveDialog open={toggleOpen} onOpenChange={setToggleOpen} user={toggling} />
    </div>
  );
}
