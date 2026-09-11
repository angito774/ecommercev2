import { auth, currentUser } from '@clerk/nextjs/server';
import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ACCOUNT_SECTIONS } from '@/modules/account/constants';
import { toAccountProfile } from '@/modules/account/lib/profile';
import { OrderHistory } from '@/modules/orders/components/order-history';
import { SavedCards } from '@/modules/payments/components/saved-cards';
import { AccountEmpty } from '@/modules/storefront/components/account-empty';
import { AccountNav } from '@/modules/storefront/components/account-nav';
import { AccountProfileCard } from '@/modules/storefront/components/account-profile-card';
import { AccountSection } from '@/modules/storefront/components/account-section';
import { AccountSummaryCards } from '@/modules/storefront/components/account-summary-cards';
import * as userRepository from '@/server/repositories/user.repository';

export const metadata: Metadata = {
  title: 'Mi cuenta',
  description: 'Tus datos, tus favoritos, tus compras y tus tarjetas en un solo sitio.',
  // Página privada: el 307 ya la protege, pero la URL puede acabar en un sitemap
  // externo y no debe aparecer en resultados como una promesa rota (D-12, AC11).
  robots: { index: false },
};

const [PROFILE_SECTION, FAVORITES_SECTION, ORDERS_SECTION, CARDS_SECTION] = ACCOUNT_SECTIONS;

// Decoración pura: tres tarjetas y un corazón, nada que represente un dato. Va con
// las clases `nx-a*` que resuelve globals.css contra los tokens del tema, como
// `CategoryArt`, así que se ve bien en claro y en oscuro sin duplicar el marcado.
// `aria-hidden`: el texto de al lado ya dice todo lo que hay que decir (AC9).
function FavoritesIllustration() {
  return (
    <svg
      viewBox="0 0 240 76"
      className="nx-art h-[76px] w-auto max-w-full"
      aria-hidden="true"
    >
      <rect className="nx-a4" x="4" y="18" width="52" height="46" rx="8" opacity="0.5" />
      <rect className="nx-a4" x="64" y="10" width="52" height="54" rx="8" opacity="0.75" />
      <rect className="nx-a1" x="124" y="18" width="52" height="46" rx="8" opacity="0.5" />
      <rect className="nx-a2" x="74" y="22" width="32" height="4" rx="2" />
      <rect className="nx-a2" x="74" y="32" width="22" height="4" rx="2" />
      <path
        className="nx-a3"
        d="M199 62c-14-9-22-17-22-26a12 12 0 0 1 22-6 12 12 0 0 1 22 6c0 9-8 17-22 26Z"
      />
    </svg>
  );
}

type Props = PageProps<'/account'>;

export default async function AccountPage({ searchParams }: Props) {
  // Verificación en el propio recurso: en una page, `auth.protect()` es el 307 a
  // `/sign-in?redirect_url=…` (docs/SETUP.md §6, CLAUDE.md regla 8). Sin
  // `loading.tsx` en el segmento para que este redirect llegue antes del primer
  // flush (D-11).
  const { userId } = await auth.protect();

  // Un solo `Promise.all` y no tres `await` encadenados: las tres lecturas son
  // independientes y la fila espejo de `users` es una consulta por PK. Encadenarlas
  // convertiría la página en una cascada de viajes (spec 013, §10).
  //
  // `findByClerkId()` es la flecha «Server Component → repositorio» de
  // docs/SETUP.md §4: ningún componente importa el repositorio, la page lo lee y
  // solo baja un booleano.
  const [user, dbUser, { card }] = await Promise.all([
    currentUser(),
    userRepository.findByClerkId(userId),
    searchParams,
  ]);

  // La sesión es válida pero la Backend API no resuelve al usuario: antes media
  // ficha con huecos, mejor devolverlo al login (§10).
  if (!user) redirect('/sign-in');

  const profile = toAccountProfile(user);

  // La fila espejo puede no existir todavía —el webhook de Clerk aún no está
  // registrado (docs/SETUP.md §7)—, y sin Customer de Stripe el badge simplemente no
  // se pinta. En ningún caso se inventa.
  const hasStripeCustomer = dbUser?.stripeCustomerId != null;

  // La bandera del retorno se lee en el servidor y baja como prop: la page ya es
  // dinámica y ya lee `searchParams` en `/checkout/success`, así que hacerlo igual
  // evita el bailout de CSR de `useSearchParams` y deja el componente cliente sin
  // acoplarse a la URL (D-17).
  const justAddedCard = card === 'added';

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)] py-[clamp(2rem,5vw,3.5rem)]">
      <header className="mb-[clamp(2rem,4vw,3rem)]">
        <h1 className="text-[clamp(1.875rem,4.3vw,3rem)] leading-[1.08] font-semibold tracking-[-0.035em]">
          Mi cuenta
        </h1>
        <p className="text-muted-foreground mt-3 max-w-[56ch] text-[15px] leading-relaxed">
          Tus datos, lo que guardaste para más tarde, lo que ya has comprado y las tarjetas
          con las que pagas.
        </p>
      </header>

      {/* Sobre las secciones y no dentro de ninguna: es el resumen de las tres que
          vienen debajo. `"use client"` entra aquí, un nivel por debajo de la page,
          que sigue siendo Server Component con su `auth.protect()` (regla 7). */}
      <AccountSummaryCards memberSince={profile.createdAt} />

      <div className="grid items-start gap-[clamp(2rem,4vw,3.5rem)] lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <AccountNav />

        <div className="flex flex-col gap-[clamp(2.5rem,6vw,4.5rem)]">
          <AccountSection id={PROFILE_SECTION.id} eyebrow="Tus datos" title={PROFILE_SECTION.label}>
            <AccountProfileCard profile={profile} hasStripeCustomer={hasStripeCustomer} />
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
              illustration={<FavoritesIllustration />}
            />
          </AccountSection>

          <AccountSection
            id={ORDERS_SECTION.id}
            eyebrow="Tu historial"
            title={ORDERS_SECTION.label}
          >
            {/* La page sigue siendo Server Component y conserva su `auth.protect()`;
                `"use client"` entra aquí, un nivel más abajo (docs/SETUP.md §4,
                regla 7). El historial es interactivo —filtro, diálogo, reintento—
                y sus datos viven en TanStack Query, no en el render inicial. */}
            <OrderHistory />
          </AccountSection>

          <AccountSection
            id={CARDS_SECTION.id}
            eyebrow="Tus medios de pago"
            title={CARDS_SECTION.label}
          >
            {/* Mismo criterio que el historial: la page sigue siendo Server Component
                con su `auth.protect()` y `"use client"` entra un nivel más abajo
                (docs/SETUP.md §4, regla 7). */}
            <SavedCards justAdded={justAddedCard} />
          </AccountSection>
        </div>
      </div>
    </div>
  );
}
