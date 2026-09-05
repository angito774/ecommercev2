import { auth, currentUser } from '@clerk/nextjs/server';
import { Heart, ShoppingBag } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ACCOUNT_SECTIONS } from '@/modules/account/constants';
import { toAccountProfile } from '@/modules/account/lib/profile';
import { AccountEmpty } from '@/modules/storefront/components/account-empty';
import { AccountNav } from '@/modules/storefront/components/account-nav';
import { AccountProfileCard } from '@/modules/storefront/components/account-profile-card';
import { AccountSection } from '@/modules/storefront/components/account-section';

export const metadata: Metadata = {
  title: 'Mi cuenta',
  description: 'Tus datos, tus favoritos y tus compras en un solo sitio.',
  // Página privada: el 307 ya la protege, pero la URL puede acabar en un sitemap
  // externo y no debe aparecer en resultados como una promesa rota (D-12, AC11).
  robots: { index: false },
};

const [PROFILE_SECTION, FAVORITES_SECTION, ORDERS_SECTION] = ACCOUNT_SECTIONS;

export default async function AccountPage() {
  // Verificación en el propio recurso: en una page, `auth.protect()` es el 307 a
  // `/sign-in?redirect_url=…` (docs/SETUP.md §6, CLAUDE.md regla 8). Sin
  // `loading.tsx` en el segmento para que este redirect llegue antes del primer
  // flush (D-11).
  await auth.protect();

  const user = await currentUser();

  // La sesión es válida pero la Backend API no resuelve al usuario: antes media
  // ficha con huecos, mejor devolverlo al login (§10).
  if (!user) redirect('/sign-in');

  const profile = toAccountProfile(user);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)] py-[clamp(2rem,5vw,3.5rem)]">
      <header className="mb-[clamp(2rem,4vw,3rem)]">
        <h1 className="text-[clamp(1.875rem,4.3vw,3rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
          Mi cuenta
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[56ch] text-[15px] leading-relaxed">
          Tus datos, lo que guardaste para más tarde y lo que ya has comprado.
        </p>
      </header>

      <div className="grid items-start gap-[clamp(2rem,4vw,3.5rem)] lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <AccountNav />

        <div className="flex flex-col gap-[clamp(2.5rem,6vw,4.5rem)]">
          <AccountSection id={PROFILE_SECTION.id} eyebrow="Tus datos" title={PROFILE_SECTION.label}>
            <AccountProfileCard profile={profile} />
          </AccountSection>

          <AccountSection
            id={FAVORITES_SECTION.id}
            eyebrow="Para más tarde"
            title={FAVORITES_SECTION.label}
          >
            <AccountEmpty
              icon={Heart}
              title="Todavía no has guardado nada"
              body="Cuando encuentres algo que te interese, guárdalo aquí y lo tendrás a mano la próxima vez que entres."
              ctaHref="/#catalogo"
              ctaLabel="Ver el catálogo"
            />
          </AccountSection>

          <AccountSection
            id={ORDERS_SECTION.id}
            eyebrow="Tu historial"
            title={ORDERS_SECTION.label}
          >
            <AccountEmpty
              icon={ShoppingBag}
              title="Aún no tienes ninguna compra"
              body="Aquí aparecerán tus pedidos con su estado y su detalle en cuanto hagas el primero."
              ctaHref="/#ofertas"
              ctaLabel="Ver las ofertas"
            />
          </AccountSection>
        </div>
      </div>
    </div>
  );
}
