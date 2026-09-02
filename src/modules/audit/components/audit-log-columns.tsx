'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Filter } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isRoleSlug } from '@/lib/permissions';
import { roleLabel } from '@/modules/roles/constants';

import {
  auditActionLabel,
  auditFieldLabel,
  AUDIT_SEVERITY_LABELS,
  entityTypeLabel,
} from '../constants';
import type { AuditLogWithActor, AuditSeverity } from '../types/audit-log.types';

export type AuditActor = { id: string; email: string | null };

type AuditLogColumnsOptions = {
  // El filtro por actor se arma desde la fila en vez de con un desplegable de
  // usuarios: el contrato filtra por `actorId` (uuid) y pedirle a alguien que
  // escriba un uuid no es una interfaz. Además evita que la bitácora dependa del
  // listado de `/api/admin/users`, que exige otro permiso.
  onFilterByActor: (actor: AuditActor) => void;
};

const dateFormatter = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// Los timestamps llegan del Route Handler serializados como texto ISO aunque el
// tipo inferido de Drizzle los declare Date; se acepta ambas formas.
function formatDateTime(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

const SEVERITY_VARIANTS: Record<AuditSeverity, 'secondary' | 'default' | 'destructive'> = {
  info: 'secondary',
  warning: 'default',
  error: 'destructive',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Ruido de infraestructura: quien lee la bitácora quiere saber qué cambió, no el
// uuid ni los timestamps que la propia fila ya muestra.
const OMITTED_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'ninguno';
    return value
      .map((item) => (typeof item === 'string' && isRoleSlug(item) ? roleLabel(item) : String(item)))
      .join(', ');
  }

  if (isPlainObject(value)) return JSON.stringify(value);

  return String(value);
}

type FieldChange = { field: string; before: unknown; after: unknown };

function diffFields(before: unknown, after: unknown): FieldChange[] | null {
  // Ni `before` ni `after` son objetos planos: no hay nada que tabular y la vista
  // cae al volcado JSON, que sigue siendo mejor que no mostrar nada.
  if (!isPlainObject(before) && !isPlainObject(after)) return null;

  const beforeObject = isPlainObject(before) ? before : {};
  const afterObject = isPlainObject(after) ? after : {};

  const fields = [...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])];

  return fields
    .filter((field) => !OMITTED_FIELDS.has(field))
    .map((field) => ({ field, before: beforeObject[field], after: afterObject[field] }))
    .filter(
      // En una edición solo interesa lo que se movió; en un alta `before` está vacío
      // y todos los campos pasan el filtro por sí solos.
      (change) => formatValue(change.before) !== formatValue(change.after),
    );
}

function ChangesDetail({ log }: { log: AuditLogWithActor }) {
  const { changes, metadata } = log;
  if (!changes && !metadata) return <span className="text-muted-foreground text-sm">—</span>;

  const fields = changes ? diffFields(changes.before, changes.after) : [];

  return (
    // `<details>` nativo en vez de expandir la fila con TanStack Table: el
    // `DataTable` compartido solo pinta celdas, y añadirle sub-filas por este único
    // consumidor cambiaría también las tablas de categorías y usuarios. De paso, se
    // abre con teclado sin escribir nada.
    <details>
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm underline-offset-4 hover:underline">
        Ver detalle
      </summary>

      <div className="mt-2 space-y-3">
        {fields === null ? (
          <pre className="bg-muted text-muted-foreground max-w-md overflow-x-auto rounded-md p-2 text-xs">
            {JSON.stringify(changes, null, 2)}
          </pre>
        ) : fields.length === 0 ? (
          <p className="text-muted-foreground text-xs">Sin cambios de campos registrados.</p>
        ) : (
          <dl className="space-y-1">
            {fields.map((change) => (
              <div key={change.field} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <dt className="font-medium">{auditFieldLabel(change.field)}:</dt>
                <dd className="text-muted-foreground">
                  <span className="line-through">{formatValue(change.before)}</span>
                  <span className="mx-1" aria-label="cambió a">
                    →
                  </span>
                  <span className="text-foreground">{formatValue(change.after)}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {metadata ? (
          <dl className="space-y-1">
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <dt className="font-medium">{auditFieldLabel(key)}:</dt>
                <dd className="text-muted-foreground">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </details>
  );
}

// Sin columna de acciones y sin ningún control de escritura: la bitácora es
// append-only y esta vista solo consulta (AC14).
export function getAuditLogColumns({
  onFilterByActor,
}: AuditLogColumnsOptions): ColumnDef<AuditLogWithActor>[] {
  return [
    {
      accessorKey: 'createdAt',
      header: 'Fecha',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      accessorKey: 'actorEmail',
      header: 'Quién',
      enableSorting: false,
      cell: ({ row }) => {
        const { actorId, actorEmail } = row.original;

        // `actor_id` nulo es el webhook de Clerk o el seed, no un dato que falte.
        if (!actorId) {
          return <span className="text-muted-foreground text-sm">Sistema</span>;
        }

        return (
          <Button
            variant="link"
            size="sm"
            className="h-auto max-w-56 justify-start truncate p-0 text-sm font-normal"
            onClick={() => onFilterByActor({ id: actorId, email: actorEmail })}
          >
            <Filter className="size-3" aria-hidden />
            <span className="truncate">{actorEmail ?? 'Cuenta eliminada'}</span>
            <span className="sr-only">Filtrar la bitácora por esta persona</span>
          </Button>
        );
      },
    },
    {
      accessorKey: 'action',
      header: 'Acción',
      enableSorting: false,
      cell: ({ row }) => <span className="text-sm">{auditActionLabel(row.original.action)}</span>,
    },
    {
      accessorKey: 'entityType',
      header: 'Sobre',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {entityTypeLabel(row.original.entityType)}
        </span>
      ),
    },
    {
      accessorKey: 'severity',
      header: 'Severidad',
      enableSorting: false,
      cell: ({ row }) => {
        const { severity } = row.original;

        return (
          <Badge variant={SEVERITY_VARIANTS[severity]} className="font-normal">
            {AUDIT_SEVERITY_LABELS[severity]}
          </Badge>
        );
      },
    },
    {
      id: 'detail',
      header: 'Detalle',
      enableSorting: false,
      cell: ({ row }) => <ChangesDetail log={row.original} />,
    },
  ];
}
