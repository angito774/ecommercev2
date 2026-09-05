'use client';

import { useClerk } from '@clerk/nextjs';
import { Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';

// Única hoja cliente de `/account`, y sin props a propósito: nada del DTO del perfil
// cruza la frontera al navegador por esta vía (spec 006, §10).
//
// La edición de nombre, foto, correo, contraseña y MFA sigue siendo de Clerk; aquí
// solo se abre su modal.
export function ManageAccountButton() {
  const { openUserProfile } = useClerk();

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 rounded-full px-5"
      onClick={() => openUserProfile()}
    >
      <Settings aria-hidden />
      Gestionar mi cuenta
    </Button>
  );
}
