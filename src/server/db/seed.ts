import { config } from 'dotenv';
import { desc, eq, sql } from 'drizzle-orm';

import { PERMISSIONS, ROLE_DEFINITIONS, ROLE_PERMISSION_MATRIX } from '../../lib/permissions';

config({ path: '.env.local' });

// El cliente Drizzle valida DATABASE_URL al importarse, así que la carga de
// dotenv debe ocurrir antes: por eso los imports son dinámicos y no estáticos.
// `../../lib/permissions` sí es estático porque el catálogo es un módulo puro.
async function loadDeps() {
  const [{ db }, schema, { logAudit }, userRepository] = await Promise.all([
    import('./index'),
    import('./schema'),
    import('../../lib/audit'),
    import('../repositories/user.repository'),
  ]);
  return { db, schema, logAudit, userRepository };
}

type SeedDeps = Awaited<ReturnType<typeof loadDeps>>;

const CATEGORY_ROWS = [
  {
    name: 'Laptops',
    slug: 'laptops',
    description: 'Portátiles para trabajo, estudio y gaming.',
    imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853',
    isActive: true,
  },
  {
    name: 'Smartphones',
    slug: 'smartphones',
    description: 'Teléfonos inteligentes de todas las gamas.',
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9',
    isActive: true,
  },
  {
    name: 'Monitores',
    slug: 'monitores',
    description: 'Pantallas para productividad y gaming.',
    imageUrl: null,
    isActive: true,
  },
  {
    name: 'Periféricos',
    slug: 'perifericos',
    description: 'Teclados, ratones, audífonos y accesorios de escritorio.',
    imageUrl: null,
    isActive: true,
  },
  {
    name: 'Componentes de PC',
    slug: 'componentes-de-pc',
    description: 'Tarjetas gráficas, procesadores, memorias y almacenamiento.',
    imageUrl: null,
    isActive: true,
  },
  {
    name: 'Almacenamiento',
    slug: 'almacenamiento',
    description: 'Discos SSD, HDD y unidades externas.',
    imageUrl: null,
    isActive: true,
  },
  {
    name: 'Tablets',
    slug: 'tablets',
    description: 'Tablets y accesorios de dibujo digital.',
    imageUrl: null,
    isActive: false,
  },
];

async function seedCategories({ db, schema }: SeedDeps): Promise<void> {
  const inserted = await db
    .insert(schema.categories)
    .values(CATEGORY_ROWS)
    .onConflictDoNothing({ target: schema.categories.slug })
    .returning({ slug: schema.categories.slug });

  console.log(
    `Categorías: ${inserted.length} insertadas, ${CATEGORY_ROWS.length - inserted.length} ya existían.`,
  );
}

// `onConflictDoUpdate` en vez de `onConflictDoNothing`: el catálogo del código es la
// fuente de verdad de los metadatos, así que una re-ejecución debe propagar cambios
// de descripción, de `resource`/`action` y sobre todo de `is_elevated`, que la capa
// de autorización lee para exigir `users.assign_elevated_roles`. No borra ninguna
// fila: solo refresca columnas, conservando `id` y las FKs que ya apuntan a ellas.
async function seedPermissions({ db, schema }: SeedDeps): Promise<void> {
  const upserted = await db
    .insert(schema.permissions)
    .values(PERMISSIONS.map((permission) => ({ ...permission })))
    .onConflictDoUpdate({
      target: schema.permissions.code,
      set: {
        resource: sql`excluded.resource`,
        action: sql`excluded.action`,
        description: sql`excluded.description`,
      },
    })
    .returning({ code: schema.permissions.code });

  console.log(`Permisos: ${upserted.length} sincronizados sobre ${PERMISSIONS.length}.`);
}

async function seedRoles({ db, schema }: SeedDeps): Promise<void> {
  const upserted = await db
    .insert(schema.roles)
    .values(ROLE_DEFINITIONS.map((role) => ({ ...role, isSystem: true })))
    .onConflictDoUpdate({
      target: schema.roles.slug,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        isElevated: sql`excluded.is_elevated`,
        updatedAt: new Date(),
      },
    })
    .returning({ slug: schema.roles.slug });

  console.log(`Roles: ${upserted.length} sincronizados sobre ${ROLE_DEFINITIONS.length}.`);
}

async function seedRolePermissions({ db, schema }: SeedDeps): Promise<void> {
  const [roleRows, permissionRows] = await Promise.all([
    db.select({ id: schema.roles.id, slug: schema.roles.slug }).from(schema.roles),
    db
      .select({ id: schema.permissions.id, code: schema.permissions.code })
      .from(schema.permissions),
  ]);

  const roleIdBySlug = new Map(roleRows.map((role) => [role.slug, role.id]));
  const permissionIdByCode = new Map(permissionRows.map((p) => [p.code, p.id]));

  const rows: Array<{ roleId: string; permissionId: string }> = [];
  for (const [slug, codes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const roleId = roleIdBySlug.get(slug);
    if (!roleId) continue;

    for (const code of codes) {
      const permissionId = permissionIdByCode.get(code);
      if (permissionId) rows.push({ roleId, permissionId });
    }
  }

  // `employee` y `customer` aportan cero filas a propósito. Si la matriz completa
  // quedara vacía, un INSERT sin valores fallaría en Drizzle.
  if (rows.length === 0) {
    console.log('Matriz rol × permiso: sin filas que insertar.');
    return;
  }

  const inserted = await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();

  console.log(
    `Matriz rol × permiso: ${inserted.rowCount ?? 0} asignaciones nuevas sobre ${rows.length} del catálogo.`,
  );
}

// El literal 'super_admin' aquí es un dato del seed, no una decisión de
// autorización: la app nunca compara nombres de rol (CLAUDE.md regla 10).
const BOOTSTRAP_ROLE_SLUG = 'super_admin';

async function bootstrapSuperAdmin({
  db,
  schema,
  logAudit,
  userRepository,
}: SeedDeps): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim();
  if (!email) {
    console.log('Bootstrap de super administrador: omitido (SEED_SUPER_ADMIN_EMAIL vacía).');
    return;
  }

  // `users.email` no es unique: si alguien borró su cuenta de Clerk y volvió a
  // registrarse, la fila histórica sigue ahí. Gana la más reciente.
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .orderBy(desc(schema.users.createdAt))
    .limit(1);

  if (!user) {
    console.warn(
      `Bootstrap de super administrador: no hay ningún usuario con ${email}. Regístrate primero y vuelve a ejecutar el seed.`,
    );
    return;
  }

  const [role] = await db
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(eq(schema.roles.slug, BOOTSTRAP_ROLE_SLUG))
    .limit(1);

  if (!role) {
    console.warn('Bootstrap de super administrador: el rol semilla no existe.');
    return;
  }

  // Los roles previos se leen antes de abrir la transacción para que el `before`
  // de la bitácora sea el conjunto real y no una suposición: la persona puede
  // llegar aquí con roles ya asignados desde el panel o desde una invitación.
  const beforeRoleSlugs = (await userRepository.findRolesByUserId(user.id)).map(
    (role) => role.slug,
  );

  // Otorgar el rol más privilegiado es una mutación de seguridad: va en una
  // transacción con su entrada en `audit_logs` (CLAUDE.md regla 11 y
  // docs/SETUP.md §5.2 regla 2). `actorId: null` porque el actor es el seed, no una
  // persona; `metadata.source` deja constancia de por dónde entró.
  const granted = await db.transaction(async (tx) => {
    const [assigned] = await tx
      .insert(schema.userRoles)
      .values({ userId: user.id, roleId: role.id })
      .onConflictDoNothing()
      .returning({ userId: schema.userRoles.userId });

    if (!assigned) return false;

    await logAudit(tx, {
      actorId: null,
      action: 'user.roles_changed',
      entityType: 'user',
      entityId: user.id,
      severity: 'warning',
      // Solo se llega aquí cuando el INSERT insertó de verdad, así que el rol
      // semilla no estaba en `beforeRoleSlugs` y el `after` es el antes más él.
      changes: {
        before: { roleSlugs: beforeRoleSlugs },
        after: { roleSlugs: [...beforeRoleSlugs, BOOTSTRAP_ROLE_SLUG] },
      },
      metadata: { source: 'db:seed' },
    });

    return true;
  });

  console.log(
    granted
      ? `Bootstrap de super administrador: rol otorgado a ${email}.`
      : `Bootstrap de super administrador: ${email} ya lo tenía.`,
  );
}

async function main() {
  const deps = await loadDeps();

  await seedCategories(deps);
  await seedPermissions(deps);
  await seedRoles(deps);
  await seedRolePermissions(deps);
  await bootstrapSuperAdmin(deps);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('Seed fallido:', error);
    process.exit(1);
  });
