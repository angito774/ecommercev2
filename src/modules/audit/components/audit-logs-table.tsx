'use client';

import {
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type PaginationState,
} from '@tanstack/react-table';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_OPTIONS,
  AUDIT_SEVERITY_OPTIONS,
  DEFAULT_PAGE_SIZE,
} from '../constants';
import { useAuditLogs } from '../hooks/use-audit-logs';
import type { AuditLogQueryParams } from '../schemas/audit-log.schema';
import type { AuditLogWithActor } from '../types/audit-log.types';

import { getAuditLogColumns, type AuditActor } from './audit-log-columns';

type Severity = AuditLogQueryParams['severity'];

const NO_ROWS: AuditLogWithActor[] = [];

// El `<input type="date">` da la fecha en hora local; el contrato pide un ISO
// completo. Se abre el día en su primer instante y se cierra en el último para que
// "del 1 al 3" incluya el día 3 entero, que es lo que espera quien filtra.
function startOfDayIso(value: string): string | undefined {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function endOfDayIso(value: string): string | undefined {
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function AuditLogsTable() {
  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('all');
  const [severity, setSeverity] = useState<Severity>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [actor, setActor] = useState<AuditActor | null>(null);
  const [page, setPage] = useState(1);

  // Sin este reinicio, filtrar desde la página 3 devuelve un listado vacío que
  // parece un fallo.
  useEffect(() => {
    setPage(1);
  }, [entityType, action, severity, fromDate, toDate, actor]);

  const params: AuditLogQueryParams = useMemo(
    () => ({
      actorId: actor?.id,
      entityType: entityType === 'all' ? undefined : entityType,
      action: action === 'all' ? undefined : action,
      severity,
      from: fromDate === '' ? undefined : startOfDayIso(fromDate),
      to: toDate === '' ? undefined : endOfDayIso(toDate),
      page,
      pageSize: DEFAULT_PAGE_SIZE,
    }),
    [actor, entityType, action, severity, fromDate, toDate, page],
  );

  const query = useAuditLogs(params);

  const hasFilters =
    actor !== null ||
    entityType !== 'all' ||
    action !== 'all' ||
    severity !== 'all' ||
    fromDate !== '' ||
    toDate !== '';

  const entityLabel = AUDIT_ENTITY_OPTIONS.find((option) => option.value === entityType)?.label;
  const actionLabelText = AUDIT_ACTION_OPTIONS.find((option) => option.value === action)?.label;
  const severityLabel = AUDIT_SEVERITY_OPTIONS.find((option) => option.value === severity)?.label;

  function clearFilters() {
    setEntityType('all');
    setAction('all');
    setSeverity('all');
    setFromDate('');
    setToDate('');
    setActor(null);
  }

  const columns = useMemo(
    () =>
      getAuditLogColumns({
        onFilterByActor: setActor,
      }),
    [],
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
    manualFiltering: true,
    // La bitácora sale siempre por fecha descendente desde el repositorio: no hay
    // orden que el usuario pueda cambiar, así que tampoco hay estado de sorting.
    rowCount: query.data?.meta.total ?? 0,
    state: { pagination },
    onPaginationChange,
  });

  const emptyState = hasFilters ? (
    <>
      <p className="text-sm font-medium">Sin resultados</p>
      <p className="text-muted-foreground text-sm">
        Ninguna entrada coincide con los filtros aplicados.
      </p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Limpiar filtros
      </Button>
    </>
  ) : (
    <>
      <p className="text-sm font-medium">Todavía no hay actividad registrada</p>
      <p className="text-muted-foreground text-sm">
        Aquí aparecerá cada cambio sobre categorías, personas y accesos.
      </p>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-entity">Sobre</Label>
          <Select value={entityType} onValueChange={setEntityType}>
            <SelectTrigger id="audit-entity" className="w-40">
              {/* Texto explícito: SelectValue depende de que el item esté montado y
                  el contenido solo se monta al abrir el desplegable. */}
              <SelectValue>{entityLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUDIT_ENTITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">Acción</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger id="audit-action" className="w-52">
              <SelectValue>{actionLabelText}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUDIT_ACTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-severity">Severidad</Label>
          <Select value={severity} onValueChange={(value) => setSeverity(value as Severity)}>
            <SelectTrigger id="audit-severity" className="w-48">
              <SelectValue>{severityLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUDIT_SEVERITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-from">Desde</Label>
          <Input
            id="audit-from"
            type="date"
            value={fromDate}
            max={toDate === '' ? undefined : toDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-to">Hasta</Label>
          <Input
            id="audit-to"
            type="date"
            value={toDate}
            min={fromDate === '' ? undefined : fromDate}
            onChange={(event) => setToDate(event.target.value)}
            className="w-40"
          />
        </div>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {actor ? (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Filtrando por:</span>
          <Badge variant="secondary" className="font-normal">
            {actor.email ?? 'Cuenta eliminada'}
            <button
              type="button"
              onClick={() => setActor(null)}
              className="hover:text-foreground ml-1 cursor-pointer"
            >
              <X className="size-3" aria-hidden />
              <span className="sr-only">Quitar el filtro por persona</span>
            </button>
          </Badge>
        </div>
      ) : null}

      <DataTable
        table={table}
        isLoading={query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        empty={emptyState}
      />
    </div>
  );
}
