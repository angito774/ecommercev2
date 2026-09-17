import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import {
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  ShieldCheck,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getEffectivePermissions } from '@/lib/auth';
import { APP_NAME } from '@/lib/constants';
import { can, type PermissionCode } from '@/lib/permissions';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: PermissionCode;
};

const NAV_ITEMS: readonly NavItem[] = [
  // Primero porque es la raíz del panel: quien entra por `/admin` ya está aquí
  // (spec 015, D-1). Sin `dashboard.read` el filtro de abajo la retira (AC3).
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.read' },
  { href: '/admin/products', label: 'Productos', icon: Package, permission: 'products.read' },
  { href: '/admin/categories', label: 'Categorías', icon: Tags, permission: 'categories.read' },
  { href: '/admin/orders', label: 'Pedidos', icon: Receipt, permission: 'orders.read' },
  { href: '/admin/users', label: 'Usuarios', icon: Users, permission: 'users.read' },
  { href: '/admin/roles', label: 'Roles', icon: ShieldCheck, permission: 'roles.read' },
  { href: '/admin/audit-logs', label: 'Bitácora', icon: ScrollText, permission: 'audit_logs.read' },
];

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await auth.protect();

  // Comodidad, no frontera de seguridad: evita que `employee`, `customer` y quien
  // aún no tiene rol vean un shell vacío. La frontera real es el
  // `requirePagePermission()` de cada page y el 401/403 de cada handler, porque la API
  // es alcanzable sin atravesar ningún layout (CLAUDE.md regla 8).
  const granted = await getEffectivePermissions();
  if (granted.size === 0) redirect('/');

  // Mismo set memoizado por `cache()`: el redirect y la navegación pagan una sola
  // consulta a Neon.
  const navItems = NAV_ITEMS.filter((item) => can(granted, item.permission));

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* `h-screen` sin restar nada: el layout admin cuelga directo del `<body>`,
          no hay header global encima que consuma viewport. `sticky` mantiene la
          navegación a la vista mientras el `<main>` desplaza. */}
      <aside className="bg-muted/30 border-b md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex h-14 items-center gap-2 px-4">
          <Link href="/" className="truncate font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <div className="ml-auto flex items-center">
            <UserButton />
          </div>
        </div>
        <nav className="flex gap-1 px-2 pb-3 md:flex-col md:pb-0">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
