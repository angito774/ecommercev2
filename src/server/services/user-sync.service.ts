import type { WebhookEvent } from '@clerk/nextjs/webhooks';
import { z } from 'zod';

import { logAudit } from '@/lib/audit';
import { isRoleSlug, type RoleSlug } from '@/lib/permissions';
import { db } from '@/server/db';
import * as roleRepository from '@/server/repositories/role.repository';
import * as userRepository from '@/server/repositories/user.repository';

// Se derivan del union del propio SDK en vez de importar `UserJSON`: el subpath
// `@clerk/nextjs/webhooks` reexporta el evento, no los tipos JSON sueltos.
type UserEventData = Extract<WebhookEvent, { type: 'user.created' | 'user.updated' }>['data'];
type UserDeletedEventData = Extract<WebhookEvent, { type: 'user.deleted' }>['data'];

// `UserPublicMetadata` está declarado como `{ [k: string]: unknown }`, así que el
// contenido llega sin tipo útil: un `roleSlugs` corrupto no debe poder insertar
// filas en `user_roles`. `.catch()` degrada a "sin roles" en vez de reventar el
// webhook, porque los metadatos los puede escribir cualquier integración.
const publicMetadataSchema = z
  .object({ roleSlugs: z.array(z.string().refine(isRoleSlug)).optional() })
  .catch({});

export function readRoleSlugs(publicMetadata: unknown): RoleSlug[] {
  return publicMetadataSchema.parse(publicMetadata).roleSlugs ?? [];
}

// Solo el correo primario. Sin fallback al primero de la lista: ese email es la
// clave con la que el seed busca al `super_admin`, y un correo secundario —que Clerk
// no exige verificar— no debe poder atraer un rol elevado.
export function readPrimaryEmail(data: UserEventData): string | null {
  const primary = data.email_addresses.find(
    (address) => address.id === data.primary_email_address_id,
  );

  return primary?.email_address ?? null;
}

export function toUpsertValues(data: UserEventData): userRepository.UpsertUserValues | null {
  const email = readPrimaryEmail(data);
  // Una cuenta sin correo (alta solo con teléfono) no se puede reflejar: queda sin
  // fila y, por tanto, sin permisos. Mismo default seguro que el upsert JIT.
  if (!email) return null;

  return {
    clerkId: data.id,
    email,
    firstName: data.first_name,
    lastName: data.last_name,
    imageUrl: data.image_url || null,
  };
}

export async function syncUserCreated(data: UserEventData): Promise<void> {
  const values = toUpsertValues(data);
  if (!values) {
    console.warn(`user.created ${data.id}: sin correo, no se refleja en users.`);
    return;
  }

  // Los roles de la invitación viajan en `public_metadata`. Se resuelven a ids
  // antes de abrir la transacción para no sostenerla durante lecturas.
  const requested = readRoleSlugs(data.public_metadata);
  const matched = await roleRepository.findBySlugs(requested);

  if (matched.length !== requested.length) {
    console.warn(
      `user.created ${data.id}: ${requested.length - matched.length} rol(es) de la invitación no existen en la base. ¿Falta ejecutar db:seed?`,
    );
  }

  await db.transaction(async (tx) => {
    const user = await userRepository.upsertFromClerk(tx, values);
    await userRepository.addRoles(
      tx,
      user.id,
      matched.map((role) => role.id),
    );

    // `actorId: null`: el actor es el webhook, no una persona. Sin correo ni
    // payload crudo en la bitácora; el `entityId` ya identifica la cuenta.
    await logAudit(tx, {
      actorId: null,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      severity: matched.length > 0 ? 'warning' : 'info',
      changes: { before: null, after: { roleSlugs: matched.map((role) => role.slug) } },
      metadata: { source: 'clerk.webhook' },
    });
  });
}

// Sin entrada en la bitácora a propósito: solo refleja los campos de identidad que
// Clerk ya audita por su cuenta, no una decisión del dominio, y `user.updated` se
// emite con mucha frecuencia sobre una tabla append-only que hoy no tiene purga.
// `is_active` no se toca aquí: lo gobierna el panel.
export async function syncUserUpdated(data: UserEventData): Promise<void> {
  const values = toUpsertValues(data);
  if (!values) {
    console.warn(`user.updated ${data.id}: sin correo, no se refleja en users.`);
    return;
  }

  // Upsert y no update: los eventos pueden llegar desordenados o tras un fallo de
  // entrega, y la fila espejo podría no existir todavía.
  await db.transaction((tx) => userRepository.upsertFromClerk(tx, values));
}

export async function syncUserDeleted(data: UserDeletedEventData): Promise<void> {
  // `id` es opcional en el payload de borrado del SDK.
  if (!data.id) {
    console.warn('user.deleted: evento sin id, se ignora.');
    return;
  }

  const clerkId = data.id;

  await db.transaction(async (tx) => {
    const user = await userRepository.setActiveByClerkId(tx, clerkId, false);
    if (!user) return;

    // Perder el acceso es una mutación de seguridad: se audita aunque el origen
    // sea el propio usuario borrando su cuenta en Clerk.
    await logAudit(tx, {
      actorId: null,
      action: 'user.deactivated',
      entityType: 'user',
      entityId: user.id,
      severity: 'warning',
      changes: { before: { isActive: true }, after: { isActive: false } },
      metadata: { source: 'clerk.webhook', reason: 'user.deleted' },
    });
  });
}
