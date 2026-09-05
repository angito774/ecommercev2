import type { User } from '@clerk/nextjs/server';

import type { AccountProfile } from '../types/account.types';

// `import type` se borra en compilación, así que este archivo no arrastra código de
// servidor de Clerk al bundle aunque un componente lo importe (spec 006, §6.2).

// Dos iniciales del nombre real; si no hay nombre, la primera letra del correo. El
// resultado nunca es cadena vacía mientras haya alguno de los dos, y con ninguno
// cae en el icono de usuario que pinta la ficha (AC3).
function toInitials(user: User): string {
  const fromName = [user.firstName, user.lastName]
    .map((part) => part?.trim().charAt(0) ?? '')
    .join('');

  if (fromName) return fromName.toUpperCase();

  return user.primaryEmailAddress?.emailAddress.charAt(0).toUpperCase() ?? '';
}

function toIsoDate(unixMs: number | null): string | null {
  return unixMs === null ? null : new Date(unixMs).toISOString();
}

export function toAccountProfile(user: User): AccountProfile {
  const primaryEmail = user.primaryEmailAddress;

  return {
    // `fullName` es null cuando faltan los dos nombres: la vista decide entonces
    // qué mostrar, no este mapeo (AC3).
    fullName: user.fullName,
    email: primaryEmail?.emailAddress ?? null,
    // Cualquier estado que no sea `verified` —`unverified`, `failed`, `expired`— es
    // "sin verificar" para el cliente: el matiz lo gestiona el modal de Clerk (AC4).
    emailVerified: primaryEmail?.verification?.status === 'verified',
    phone: user.primaryPhoneNumber?.phoneNumber ?? null,
    imageUrl: user.imageUrl,
    initials: toInitials(user),
    createdAt: new Date(user.createdAt).toISOString(),
    lastSignInAt: toIsoDate(user.lastSignInAt),
  };
}
