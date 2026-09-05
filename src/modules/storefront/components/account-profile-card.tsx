import { User as UserIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { AccountProfile } from '@/modules/account/types/account.types';

import { ManageAccountButton } from './manage-account-button';

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

// Server Component: el DTO se queda aquí y solo baja al cliente `ManageAccountButton`,
// que no recibe nada (AC9).
//
// Lista de definición con líneas finas — el mismo dispositivo que `ProductSpecList`
// usa para la ficha técnica. Es la ficha del cliente igual que aquella es la del
// producto, así que reutiliza el lenguaje en vez de inventar un tercero (D-8).
export function AccountProfileCard({ profile }: { profile: AccountProfile }) {
  // Sin nombre el título cae al correo, y sin ninguno de los dos a un texto neutro:
  // en ningún caso se pinta `null` (AC3).
  const displayName = profile.fullName ?? profile.email ?? 'Mi cuenta';

  // Cada fila entra solo si tiene dato. Un `dt` con un guion es ruido con etiqueta
  // (AC4, AC5).
  const rows: { term: string; value: ReactNode }[] = [
    ...(profile.email
      ? [
          {
            term: 'Correo',
            value: (
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {profile.email}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    profile.emailVerified
                      ? 'bg-nx-accent-soft text-primary'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {profile.emailVerified ? 'Verificado' : 'Sin verificar'}
                </span>
              </span>
            ),
          },
        ]
      : []),
    ...(profile.phone ? [{ term: 'Teléfono', value: profile.phone }] : []),
    { term: 'Cuenta creada', value: formatDate(profile.createdAt) },
    ...(profile.lastSignInAt
      ? [{ term: 'Último acceso', value: formatDate(profile.lastSignInAt) }]
      : []),
  ];

  return (
    <div className="border-border bg-card rounded-[22px] border p-[clamp(1.5rem,4vw,2.5rem)]">
      <div className="flex flex-wrap items-center gap-[clamp(1rem,3vw,1.75rem)]">
        {/* `<img>` plano y no `Avatar` de shadcn: `AvatarImage` de Radix solo emite
            el `<img>` cuando su `useLayoutEffect` marca la imagen como cargada, y
            ese efecto no corre en el servidor — la URL del avatar faltaría en el
            HTML inicial (AC2). Tampoco `next/image`: `img.clerk.com` no está en los
            `remotePatterns` de next.config.ts (D-7). El fallback queda detrás por
            CSS, sin lógica de carga. */}
        <span className="bg-muted text-muted-foreground relative grid size-[88px] shrink-0 place-items-center overflow-hidden rounded-full text-xl font-semibold">
          {profile.initials ? (
            <span aria-hidden>{profile.initials}</span>
          ) : (
            <UserIcon className="size-7" aria-hidden />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- D-7 */}
          <img
            src={profile.imageUrl || undefined}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        </span>

        <div className="min-w-0 space-y-1">
          <h3 className="text-[clamp(1.25rem,2.6vw,1.625rem)] font-semibold tracking-[-0.03em] break-words">
            {displayName}
          </h3>
          <p className="text-muted-foreground text-sm">
            Tus datos los guarda y los edita Clerk, nuestro proveedor de identidad.
          </p>
        </div>
      </div>

      <dl className="mt-[clamp(1.5rem,3vw,2rem)] text-[14.5px]">
        {rows.map((row) => (
          <div
            key={row.term}
            className="border-border grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(7rem,32%)_1fr] sm:gap-4"
          >
            <dt className="text-muted-foreground">{row.term}</dt>
            <dd className="font-medium wrap-anywhere">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-[clamp(1.25rem,2.5vw,1.75rem)]">
        <ManageAccountButton />
      </div>
    </div>
  );
}
