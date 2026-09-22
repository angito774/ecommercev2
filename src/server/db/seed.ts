import { config } from 'dotenv';
import { desc, eq, sql } from 'drizzle-orm';

import { DOCUMENT_SERIES_KEYS, type DocumentSeriesKey } from '../../lib/electronic-documents';
import { TRANSACTION_TYPES } from '../../lib/inventory-transactions';
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
// Los precios se declaran ya en céntimos enteros. Escribirlos como 2199.90 y
// multiplicar por 100 aquí produce 219989.99999999997: es el punto donde más
// fácil se cuela un float en todo el spec 003 (§10).
// El tipo es explícito y no inferido: sin él, TypeScript une los literales de
// `specs` de las ocho filas y cada clave acaba como `string | undefined`, que no
// encaja con `Record<string, string>` de la columna.
type ProductSeedRow = {
  sku: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  stock: number;
  specs: Record<string, string>;
  categorySlug: string;
  isActive: boolean;
};

const PRODUCT_ROWS: ProductSeedRow[] = [
  {
    sku: 'LEN-IP3-15',
    name: 'Laptop Lenovo IdeaPad 3 15"',
    slug: 'laptop-lenovo-ideapad-3-15',
    description: 'Portátil de 15,6" con Ryzen 5, 16 GB de RAM y SSD de 512 GB.',
    priceCents: 219_900,
    stock: 12,
    specs: { Procesador: 'AMD Ryzen 5 5500U', RAM: '16 GB DDR4', Almacenamiento: 'SSD 512 GB' },
    categorySlug: 'laptops',
    isActive: true,
  },
  {
    sku: 'APL-MBA-M2',
    name: 'MacBook Air M2 13"',
    slug: 'macbook-air-m2-13',
    description: 'Chip M2 de 8 núcleos, 8 GB de memoria unificada y 256 GB de SSD.',
    priceCents: 549_900,
    stock: 4,
    specs: { Procesador: 'Apple M2', RAM: '8 GB', Pantalla: '13,6" Liquid Retina' },
    categorySlug: 'laptops',
    isActive: true,
  },
  {
    sku: 'SAM-A55-256',
    name: 'Samsung Galaxy A55 5G 256 GB',
    slug: 'samsung-galaxy-a55-5g-256gb',
    description: 'Pantalla Super AMOLED de 6,6", cámara de 50 MP y batería de 5000 mAh.',
    priceCents: 149_900,
    stock: 20,
    specs: { Pantalla: '6,6" Super AMOLED', Cámara: '50 MP', Batería: '5000 mAh' },
    categorySlug: 'smartphones',
    isActive: true,
  },
  {
    // Sin stock a propósito: el indicador de agotado necesita un caso real.
    sku: 'LG-27GN800',
    name: 'Monitor LG UltraGear 27" 165 Hz',
    slug: 'monitor-lg-ultragear-27-165hz',
    description: 'IPS QHD de 27" con 165 Hz y 1 ms para juegos.',
    priceCents: 119_900,
    stock: 0,
    specs: { Resolución: '2560x1440', Refresco: '165 Hz', Panel: 'IPS' },
    categorySlug: 'monitores',
    isActive: true,
  },
  {
    sku: 'KEY-K2-RGB',
    name: 'Teclado mecánico Keychron K2 RGB',
    slug: 'teclado-mecanico-keychron-k2-rgb',
    description: 'Inalámbrico 75 % con switches Gateron e iluminación RGB.',
    priceCents: 45_900,
    stock: 8,
    specs: { Formato: '75 %', Switches: 'Gateron Brown', Conexión: 'Bluetooth y USB-C' },
    categorySlug: 'perifericos',
    isActive: true,
  },
  {
    sku: 'NV-4060TI-8',
    name: 'Tarjeta gráfica NVIDIA RTX 4060 Ti 8 GB',
    slug: 'nvidia-rtx-4060-ti-8gb',
    description: 'GPU de gama media con 8 GB GDDR6 y ray tracing.',
    priceCents: 189_900,
    stock: 3,
    specs: { Memoria: '8 GB GDDR6', Interfaz: 'PCIe 4.0' },
    categorySlug: 'componentes-de-pc',
    isActive: true,
  },
  {
    sku: 'SAM-980-1TB',
    name: 'SSD NVMe Samsung 980 1 TB',
    slug: 'ssd-nvme-samsung-980-1tb',
    description: 'Unidad M.2 NVMe con lecturas de hasta 3500 MB/s.',
    priceCents: 34_900,
    stock: 30,
    specs: { Capacidad: '1 TB', Interfaz: 'M.2 NVMe PCIe 3.0' },
    categorySlug: 'almacenamiento',
    isActive: true,
  },
  {
    // Descatalogado: el filtro por estado necesita un inactivo que no sea el único
    // producto de su categoría.
    sku: 'LOG-MX3S',
    name: 'Mouse Logitech MX Master 3S',
    slug: 'mouse-logitech-mx-master-3s',
    description: 'Ratón ergonómico de 8000 DPI con clics silenciosos.',
    priceCents: 39_900,
    stock: 5,
    specs: { DPI: '8000', Conexión: 'Bluetooth y receptor USB' },
    categorySlug: 'perifericos',
    isActive: false,
  },
];

async function seedProducts({ db, schema }: SeedDeps): Promise<void> {
  // Las categorías se resuelven por slug y no por id: el seed no puede suponer
  // qué uuid le tocó a cada una, y el slug es el identificador estable.
  const categoryRows = await db
    .select({ id: schema.categories.id, slug: schema.categories.slug })
    .from(schema.categories);

  const idBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));

  const values = [];
  const missing: string[] = [];

  for (const { categorySlug, ...product } of PRODUCT_ROWS) {
    const categoryId = idBySlug.get(categorySlug);
    if (!categoryId) {
      missing.push(`${product.sku} → ${categorySlug}`);
      continue;
    }
    values.push({ ...product, categoryId });
  }

  if (missing.length > 0) {
    // No se lanza: el resto del catálogo sí debe sembrarse. Pero tiene que verse,
    // porque un producto que falta en silencio parece un fallo de la vista.
    console.warn(`Productos omitidos por categoría inexistente: ${missing.join(', ')}`);
  }

  const inserted = await db
    .insert(schema.products)
    .values(values)
    .onConflictDoNothing({ target: schema.products.sku })
    .returning({ sku: schema.products.sku });

  console.log(
    `Productos: ${inserted.length} insertados, ${values.length - inserted.length} ya existían.`,
  );
}

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

// Mismo reparto que `seedPermissions`: la fuente de verdad son las 6 entradas de
// `TRANSACTION_TYPES`, la tabla existe para la integridad referencial de
// `inventory_documents.transaccion_id` y para que la base sea legible sin el repo
// (spec 020, D-1). `onConflictDoUpdate` sobre la propia PK de texto (`idtrans`) hace
// el seed idempotente sin una columna `code` adicional (D-3, AC18): re-ejecutarlo
// refresca el nombre y la dirección sin borrar ninguna fila ni romper las FKs.
async function seedTransacciones({ db, schema }: SeedDeps): Promise<void> {
  const upserted = await db
    .insert(schema.transacciones)
    .values(TRANSACTION_TYPES.map((type) => ({ ...type })))
    .onConflictDoUpdate({
      target: schema.transacciones.id,
      set: { name: sql`excluded.nomtrans`, direction: sql`excluded.tipotrans` },
    })
    .returning({ id: schema.transacciones.id });

  console.log(
    `Tipos de transacción: ${upserted.length} sincronizados sobre ${TRANSACTION_TYPES.length}.`,
  );
}

// Las seis series son configuración del emisor, no del código: el RUC de otra empresa
// tiene otras series dadas de alta en Nubefact. El mapa clave → variable vive aquí y no
// en `invoicing-config.ts` porque **solo el seed las lee**: en runtime la serie vigente
// sale de `document_series`, que es la fila que también lleva el correlativo (spec 022,
// §5.5).
const SERIES_ENV_VAR: Record<DocumentSeriesKey, string> = {
  boleta: 'NUBEFACT_SERIES_BOLETA',
  factura: 'NUBEFACT_SERIES_FACTURA',
  nota_credito_boleta: 'NUBEFACT_SERIES_NOTA_CREDITO_BOLETA',
  nota_credito_factura: 'NUBEFACT_SERIES_NOTA_CREDITO_FACTURA',
  nota_debito_boleta: 'NUBEFACT_SERIES_NOTA_DEBITO_BOLETA',
  nota_debito_factura: 'NUBEFACT_SERIES_NOTA_DEBITO_FACTURA',
};

// Una letra de tipo y tres dígitos, que es la forma que SUNAT admite y la anchura de la
// columna. Se valida aquí y se lanza, en vez de avisar y seguir como hace
// `seedProducts()`: una serie mal tecleada no es un producto que falte en el catálogo,
// es el identificador con el que la empresa numera sus comprobantes ante SUNAT, y
// descubrirlo en el primer rechazo permanente sería tarde.
const SERIES_PATTERN = /^[A-Z][A-Z0-9]{3}$/;

async function seedDocumentSeries({ db, schema }: SeedDeps): Promise<void> {
  const rows = DOCUMENT_SERIES_KEYS.map((key) => {
    const variable = SERIES_ENV_VAR[key];
    const series = process.env[variable]?.trim().toUpperCase();

    if (!series) {
      throw new Error(`${variable} no está definida. Copia .env.example a .env.local.`);
    }
    if (!SERIES_PATTERN.test(series)) {
      throw new Error(
        `${variable}="${series}" no es una serie válida: una letra y tres caracteres alfanuméricos (B001, FC01).`,
      );
    }

    return { key, series };
  });

  // `onConflictDoNothing` y **no** `onConflictDoUpdate` como el resto de catálogos, que es
  // la diferencia que importa de esta semilla: una fila ya creada conserva su `series` y
  // su `last_number` intactos. Reescribir la serie manteniendo el correlativo dejaría la
  // numeración continuando bajo otra letra, que es un hueco ante SUNAT; y reiniciar el
  // correlativo haría que el siguiente comprobante repitiera un número ya emitido.
  // Cambiar de serie es una operación deliberada, no un efecto de volver a sembrar.
  const inserted = await db
    .insert(schema.documentSeries)
    .values(rows)
    .onConflictDoNothing({ target: schema.documentSeries.key })
    .returning({ key: schema.documentSeries.key });

  const existing = await db
    .select({
      key: schema.documentSeries.key,
      series: schema.documentSeries.series,
      lastNumber: schema.documentSeries.lastNumber,
    })
    .from(schema.documentSeries);

  const seriesByKey = new Map(existing.map((row) => [row.key, row.series]));
  const drifted = rows.filter((row) => seriesByKey.get(row.key) !== row.series);

  if (drifted.length > 0) {
    // No se corrige solo, pero tiene que verse: significa que la variable de entorno y la
    // base dicen series distintas, y los comprobantes saldrán con la de la base.
    console.warn(
      `Series de comprobante: la base no coincide con el entorno en ${drifted
        .map((row) => `${row.key} (.env=${row.series}, base=${seriesByKey.get(row.key)})`)
        .join(', ')}. Se conserva la de la base para no romper la correlatividad.`,
    );
  }

  console.log(
    `Series de comprobante: ${inserted.length} creadas, ${existing.length - inserted.length} ya existían; correlativos ${existing
      .map((row) => `${row.series}=${row.lastNumber}`)
      .join(' ')}.`,
  );
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
  await seedProducts(deps);
  await seedPermissions(deps);
  await seedRoles(deps);
  await seedRolePermissions(deps);
  await seedTransacciones(deps);
  await seedDocumentSeries(deps);
  await bootstrapSuperAdmin(deps);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('Seed fallido:', error);
    process.exit(1);
  });
