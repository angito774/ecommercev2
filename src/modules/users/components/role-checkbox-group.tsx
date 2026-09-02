'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { isRoleSlug, type RoleSlug } from '@/lib/permissions';
import { useRoles } from '@/modules/roles/hooks/use-roles';

type RoleCheckboxGroupProps = {
  value: RoleSlug[];
  onChange: (next: RoleSlug[]) => void;
  // Llega resuelto del servidor: la UI no calcula permisos, solo los refleja.
  canAssignElevatedRoles: boolean;
  disabled?: boolean;
  // Los ids han de ser únicos en la página: dos diálogos pueden coexistir montados.
  idPrefix: string;
};

const ELEVATED_HINT =
  'Solo quien tiene permitido nombrar administradores puede marcar o desmarcar este rol.';

// Checkboxes y no un combobox buscable: con 6 roles fijos, un buscador esconde
// opciones a un usuario no técnico. Todo el conjunto visible de un vistazo.
export function RoleCheckboxGroup({
  value,
  onChange,
  canAssignElevatedRoles,
  disabled = false,
  idPrefix,
}: RoleCheckboxGroupProps) {
  const query = useRoles();

  if (query.isPending) {
    return (
      <div className="space-y-2" aria-busy>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="text-destructive text-sm">
        {query.error.message} No se pueden elegir roles hasta que la lista cargue.
      </p>
    );
  }

  const selected = new Set(value);

  // Lo que no está en el catálogo del código no se ofrece: una fila que quedó en la
  // base tras retirar un rol se descarta en vez de castear su slug.
  const options = query.data.data.flatMap((role) =>
    isRoleSlug(role.slug) ? [{ ...role, slug: role.slug }] : [],
  );

  function toggle(slug: RoleSlug, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(slug);
    else next.delete(slug);
    onChange([...next]);
  }

  return (
    <div className="space-y-2">
      {options.map((role) => {
        // Opacidad reducida y motivo escrito: ocultar la opción dejaría al admin sin
        // entender por qué no puede ascender a nadie.
        const locked = role.isElevated && !canAssignElevatedRoles;
        const id = `${idPrefix}-role-${role.slug}`;

        return (
          <FieldLabel key={role.id} htmlFor={id}>
            <Field orientation="horizontal">
              <Checkbox
                id={id}
                checked={selected.has(role.slug)}
                disabled={disabled || locked}
                onCheckedChange={(checked) => toggle(role.slug, checked === true)}
                aria-describedby={`${id}-description`}
              />
              <div className="grid gap-1">
                <FieldTitle>{role.name}</FieldTitle>
                <FieldDescription id={`${id}-description`}>
                  {role.description}
                  {locked ? ` ${ELEVATED_HINT}` : null}
                </FieldDescription>
              </div>
            </Field>
          </FieldLabel>
        );
      })}
    </div>
  );
}
