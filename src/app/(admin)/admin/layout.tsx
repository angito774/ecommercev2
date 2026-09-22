import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import {
  Boxes,
  HandCoins,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  ScrollText,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
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
  // Detrás de «Productos» porque es una vista de productos, no un dominio aparte.
  // Sin `inventory.read` el filtro de abajo la retira (spec 016, AC3).
  { href: '/admin/inventory', label: 'Inventario', icon: Boxes, permission: 'inventory.read' },
  { href: '/admin/categories', label: 'Categorías', icon: Tags, permission: 'categories.read' },
  { href: '/admin/orders', label: 'Pedidos', icon: Receipt, permission: 'orders.read' },
  // Detrás de «Pedidos» porque es lo que entra frente a lo que sale. Es la primera
  // entrada que `manager` y `audit` no ven: el filtro de abajo la retira sin
  // `finance.read` (spec 017, D-3, AC3).
  { href: '/admin/finance', label: 'Finanzas', icon: Wallet, permission: 'finance.read' },
  // Detrás de «Finanzas» y con su mismo permiso, así que las dos aparecen y desaparecen
  // juntas (spec 021, D-13, AC3). Ruta propia y no una pestaña de `/admin/finance`: aquel
  // resumen se mira por rango de fechas y esto es un estado actual del catálogo, sin
  // fechas, así que el filtro de rango de arriba no significaría nada en una de las dos.
  { href: '/admin/finance/pricing', label: 'Precio unitario', icon: Percent, permission: 'finance.read' },
  // Junto a «Finanzas» porque también es dinero que sale, y delante de «Usuarios» para
  // que se lea «nómina» antes que «personas con acceso»: son dos cosas distintas y
  // confundirlas es el riesgo principal del módulo (spec 018, D-18). El icono no es
  // `Wallet` como proponía el spec porque «Finanzas» ya lo ocupa, y dos entradas
  // seguidas con el mismo glifo se leen como la misma. Sin `payroll.read` el filtro de
  // abajo la retira, igual que «Finanzas» (AC4).
  { href: '/admin/payroll', label: 'Nómina', icon: HandCoins, permission: 'payroll.read' },
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
