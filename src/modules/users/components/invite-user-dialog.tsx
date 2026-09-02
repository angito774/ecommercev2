'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import { USER_EMAIL_CONFLICT_MESSAGE } from '../constants';
import { useInviteUser } from '../hooks/use-user-mutations';
import { inviteUserSchema, type InviteUserValues } from '../schemas/user.schema';

import { RoleCheckboxGroup } from './role-checkbox-group';

type InviteUserDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAssignElevatedRoles: boolean;
};

const EMPTY_VALUES: InviteUserValues = { email: '', roleSlugs: [] };

function InviteUserForm({
  canAssignElevatedRoles,
  onDone,
  onCancel,
}: {
  canAssignElevatedRoles: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const inviteMutation = useInviteUser();

  const { control, formState, handleSubmit, register, setError } = useForm({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: EMPTY_VALUES,
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await inviteMutation.mutateAsync(values);
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la invitación';

      // El 409 se muestra junto al campo y el diálogo sigue abierto para que el
      // admin corrija el correo sin volver a marcar los roles (AC8).
      if (message === USER_EMAIL_CONFLICT_MESSAGE) {
        setError('email', { type: 'server', message });
        return;
      }

      setError('root', { type: 'server', message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(formState.errors.email)}>
          <FieldLabel htmlFor="invite-email">Correo electrónico</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="persona@ejemplo.com"
            aria-invalid={Boolean(formState.errors.email)}
            {...register('email')}
          />
          <FieldDescription>
            Recibirá un correo con un enlace para crear su cuenta. Elegirá su propia contraseña o
            entrará con Google: tú nunca ves ni defines esa contraseña.
          </FieldDescription>
          <FieldError errors={[formState.errors.email]} />
        </Field>

        {/* FieldSet + legend y no un label suelto: un grupo de checkboxes necesita
            un nombre accesible propio, y `htmlFor` no puede apuntar a seis inputs. */}
        <FieldSet data-invalid={Boolean(formState.errors.roleSlugs)}>
          <FieldLegend variant="label">Roles</FieldLegend>
          <FieldDescription>
            Los roles se aplican solos en cuanto la persona acepte la invitación.
          </FieldDescription>
          <Controller
            control={control}
            name="roleSlugs"
            render={({ field }) => (
              <RoleCheckboxGroup
                idPrefix="invite"
                value={field.value}
                onChange={field.onChange}
                canAssignElevatedRoles={canAssignElevatedRoles}
                disabled={inviteMutation.isPending}
              />
            )}
          />
          <FieldError errors={[formState.errors.roleSlugs]} />
        </FieldSet>

        {formState.errors.root ? <FieldError errors={[formState.errors.root]} /> : null}
      </FieldGroup>

      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={inviteMutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={inviteMutation.isPending}>
          {inviteMutation.isPending ? 'Enviando…' : 'Enviar invitación'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// El formulario vive en un componente aparte y con `key`: al abrir el diálogo se
// monta de cero, así los valores se inicializan en el montaje en vez de
// sincronizarse con un efecto.
export function InviteUserDialog({
  open,
  onOpenChange,
  canAssignElevatedRoles,
}: InviteUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invitar a una persona</DialogTitle>
          <DialogDescription>
            Escribe su correo y marca lo que podrá hacer dentro del panel.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <InviteUserForm
            canAssignElevatedRoles={canAssignElevatedRoles}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
