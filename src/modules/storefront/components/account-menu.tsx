'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { LogOut, Settings, User as UserIcon } from 'lucide-react';
import Link from 'next/link';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Sustituye a `<UserButton />` porque el pedido es un dropdown propio con solo
// dos acciones (perfil / cerrar sesión), no el panel completo de Clerk con
// gestión de dispositivos y organizaciones que trae el widget por defecto.
export function AccountMenu() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();

  if (!user) return null;

  const displayName = user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'Mi cuenta';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          aria-label="Abrir menú de cuenta"
        >
          <Avatar size="sm">
            <AvatarImage src={user.imageUrl} alt="" />
            <AvatarFallback>
              <UserIcon className="size-4" aria-hidden />
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* `asChild` para que el ítem sea un `<Link>` real: la navegación a
            `/account` la resuelve el router y conserva el prefetch, en vez de un
            `router.push` dentro de un `onSelect` (spec 006, D-10). */}
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserIcon aria-hidden />
            Mi cuenta
          </Link>
        </DropdownMenuItem>
        {/* Leer es nuestro (`/account`), editar sigue siendo de Clerk (el modal). La
            etiqueta lo dice para que las dos entradas no prometan lo mismo. */}
        <DropdownMenuItem onSelect={() => openUserProfile()}>
          <Settings aria-hidden />
          Gestionar mi cuenta
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => signOut()}>
          <LogOut aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
