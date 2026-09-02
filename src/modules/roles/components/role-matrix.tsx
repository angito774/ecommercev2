'use client';

import { Check, Minus } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isPermissionCode, isRoleSlug, type PermissionCode } from '@/lib/permissions';

import { actionLabel, resourceLabel, roleDescription, roleLabel, roleOrder } from '../constants';
import { useRoles } from '../hooks/use-roles';
import type { Permission, RoleWithPermissionCodes } from '../types/role.types';

type ResourceGroup = { resource: string; permissions: Permission[] };

// Los permisos llegan del handler ya ordenados por `resource` y `action`, así que
// agrupar en una pasada basta para el `colSpan` de la cabecera.
function groupByResource(permissions: Permission[]): ResourceGroup[] {
  const groups: ResourceGroup[] = [];

  for (const permission of permissions) {
    const last = groups.at(-1);
    if (last?.resource === permission.resource) last.permissions.push(permission);
    else groups.push({ resource: permission.resource, permissions: [permission] });
  }

  return groups;
}

function GrantCell({ granted, roleName, label }: { granted: boolean; roleName: string; label: string }) {
  const Icon = granted ? Check : Minus;

  return (
    <TableCell className="text-center">
      {/* La marca no depende del color: cambia la forma del icono y además lleva
          texto solo para lectores de pantalla, porque una tabla de 66 celdas sin
          etiqueta es ilegible fuera de la vista. */}
      <Icon
        className={granted ? 'text-foreground mx-auto size-4' : 'text-muted-foreground/50 mx-auto size-4'}
        aria-hidden
      />
      <span className="sr-only">
        {roleName}: {granted ? 'sí puede' : 'no puede'} {label.toLowerCase()}
      </span>
    </TableCell>
  );
}

function MatrixSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
      <span className="sr-only">Cargando la matriz de {columns} permisos…</span>
    </div>
  );
}

export function RoleMatrix() {
  const query = useRoles();

  const groups = useMemo(() => groupByResource(query.data?.permissions ?? []), [query.data]);

  // El orden alfabético del handler mezcla los roles que abren el panel con los que
  // no; se reordena por el catálogo sin mutar la caché de TanStack Query.
  const roles = useMemo<RoleWithPermissionCodes[]>(
    () => [...(query.data?.data ?? [])].sort((a, b) => roleOrder(a.slug) - roleOrder(b.slug)),
    [query.data],
  );

  if (query.isPending) return <MatrixSkeleton columns={11} />;

  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border p-10 text-center">
        <p className="text-destructive text-sm font-medium">
          {query.error.message || 'No se pudo cargar la matriz de roles.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const permissions = query.data.permissions;

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="min-w-56 align-bottom">
                Rol
              </TableHead>
              {groups.map((group) => (
                <TableHead
                  key={group.resource}
                  colSpan={group.permissions.length}
                  className="border-l text-center"
                >
                  {resourceLabel(group.resource)}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {groups.flatMap((group) =>
                group.permissions.map((permission, index) => (
                  <TableHead
                    key={permission.id}
                    // Refuerzo para quien apunta con el ratón; la descripción
                    // completa está en la leyenda de abajo, que no depende del hover.
                    title={permission.description ?? undefined}
                    className={
                      index === 0
                        ? 'border-l text-center text-xs font-normal whitespace-nowrap'
                        : 'text-center text-xs font-normal whitespace-nowrap'
                    }
                  >
                    {actionLabel(permission.action)}
                  </TableHead>
                )),
              )}
            </TableRow>
          </TableHeader>

          <TableBody>
            {roles.map((role) => {
              const granted = new Set<PermissionCode>(role.permissionCodes);
              const name = isRoleSlug(role.slug) ? roleLabel(role.slug) : role.name;

              return (
                <TableRow key={role.id}>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground max-w-64 text-xs">
                        {isRoleSlug(role.slug) ? roleDescription(role.slug) : role.description}
                      </span>
                      {/* Una fila entera sin marcas es información válida, no un
                          fallo de carga: `employee` y `customer` no abren el panel
                          (spec 002 §5.7). Sin esta línea la fila se lee como un
                          error. */}
                      {role.permissionCodes.length === 0 ? (
                        <span className="text-muted-foreground text-xs italic">
                          Sin acceso al panel de administración.
                        </span>
                      ) : null}
                    </div>
                  </TableCell>

                  {permissions.map((permission) => (
                    <GrantCell
                      key={permission.id}
                      roleName={name}
                      label={`${actionLabel(permission.action)} en ${resourceLabel(permission.resource)}`}
                      granted={
                        isPermissionCode(permission.code) && granted.has(permission.code)
                      }
                    />
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Qué significa cada permiso</h2>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {permissions.map((permission) => (
            <div key={permission.id} className="flex flex-col">
              <dt className="text-sm font-medium">
                {resourceLabel(permission.resource)} · {actionLabel(permission.action)}
              </dt>
              <dd className="text-muted-foreground text-sm">{permission.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
