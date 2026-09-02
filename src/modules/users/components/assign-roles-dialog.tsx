'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import type { RoleSlug } from '@/lib/permissions';
import { roleLabel } from '@/modules/roles/constants';

import { useSetUserRoles } from '../hooks/use-user-mutations';
import type { UserWithRoles } from '../types/user.types';

import { RoleCheckboxGroup } from './role-checkbox-group';

type AssignRolesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRoles | null;
  canAssignElevatedRoles: boolean;
};

function sameSlugs(before: RoleSlug[], after: RoleSlug[]): boolean {
  if (before.length !== after.length) return false;
  const set = new Set(before);
  return after.every((slug) => set.has(slug));
}

function RoleList({ slugs }: { slugs: RoleSlug[] }) {
  if (slugs.length === 0) return <>Cliente (sin acceso al panel)</>;
  return <>{slugs.map(roleLabel).join(', ')}</>;
}

function AssignRolesForm({
  user,
  canAssignElevatedRoles,
  onDone,
  onCancel,
}: {
  user: UserWithRoles;
  canAssignElevatedRoles: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<RoleSlug[]>(user.roleSlugs);
  // Cambiar permisos es una acción de seguridad: nunca se guarda sin que el actor
  // vea antes qué deja y qué otorga.
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const setRolesMutation = useSetUserRoles();
  const unchanged = sameSlugs(user.roleSlugs, selected);

  async function handleConfirm() {
    setFailure(null);

    try {
      await setRolesMutation.mutateAsync({ id: user.id, input: { roleSlugs: selected } });
      onDone();
    } catch (error) {
      // El toast lo emite el hook; aquí se deja el motivo a la vista para que el
      // diálogo pueda seguir abierto sin perder la selección.
      setFailure(error instanceof Error ? error.message : 'No se pudieron guardar los roles');
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="space-y-4">
        <dl className="space-y-3 text-sm">
          <div className="space-y-0.5">
            <dt className="text-muted-foreground">Ahora tiene</dt>
            <dd className="font-medium">
              <RoleList slugs={user.roleSlugs} />
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-muted-foreground">Pasará a tener</dt>
            <dd className="font-medium">
              <RoleList slugs={selected} />
            </dd>
          </div>
        </dl>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(false)}
            disabled={setRolesMutation.isPending}
          >
            Volver
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={setRolesMutation.isPending}
          >
            {setRolesMutation.isPending ? 'Guardando…' : 'Sí, cambiar los roles'}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FieldSet>
        <FieldLegend variant="label">Roles</FieldLegend>
        <FieldDescription>
          Marca todo lo que esta persona podrá hacer. Sin ningún rol marcado queda como cliente,
          sin acceso al panel.
        </FieldDescription>
        <RoleCheckboxGroup
          idPrefix={`assign-${user.id}`}
          value={selected}
          onChange={setSelected}
          canAssignElevatedRoles={canAssignElevatedRoles}
        />
      </FieldSet>

      {failure ? <p className="text-destructive text-sm">{failure}</p> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => setConfirming(true)} disabled={unchanged}>
          Revisar cambios
        </Button>
      </DialogFooter>
    </div>
  );
}

export function AssignRolesDialog({
  open,
  onOpenChange,
  user,
  canAssignElevatedRoles,
}: AssignRolesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Roles de {user?.email}</DialogTitle>
          <DialogDescription>
            El cambio surte efecto en la siguiente petición que haga esa persona.
          </DialogDescription>
        </DialogHeader>

        {/* Remontado por `key`: al cambiar de usuario el estado local arranca de sus
            roles reales en vez de sincronizarse con un efecto. */}
        {user ? (
          <AssignRolesForm
            key={user.id}
            user={user}
            canAssignElevatedRoles={canAssignElevatedRoles}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
