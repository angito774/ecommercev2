import { Show } from '@clerk/nextjs';
import Link from 'next/link';

import { APP_NAME } from '@/lib/constants';
import type { CatalogCategory } from '@/modules/categories/types/catalog-category.types';

import { STOREFRONT_NAV } from '../constants';
import { BrandMark } from './brand-mark';
import { CategoryJumpLink } from './category-jump-link';

// `inline-flex` con altura mínima y no un `<a>` de texto suelto: en una lista, un
// enlace de 14,5 px deja una fila de ~20 px y AC17 pide 44 px de objetivo táctil.
const FOOTER_LINK_CLASS =
  'text-muted-foreground hover:text-primary inline-flex min-h-11 items-center text-[14.5px] transition-colors';

// Ningún enlace inventado. Solo anclas de la portada y rutas que existen de verdad
// (`/sign-in`, `/admin/...`): el commit 685d9c0 ya retiró una vez los enlaces que
// llevaban a "no encontrada" y no se vuelven a introducir.
export function StorefrontFooter({ categories }: { categories: CatalogCategory[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-nx-inset border-t pt-[clamp(3rem,6vw,4.75rem)] pb-8">
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(1rem,4vw,2rem)]">
        <div className="border-border grid gap-[clamp(2rem,5vw,4rem)] border-b pb-11 lg:grid-cols-[1.1fr_1.4fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-nx-display text-lg font-bold tracking-[-0.04em]">
                {APP_NAME}
              </span>
            </Link>
            <p className="text-muted-foreground mt-4 max-w-[38ch] text-sm leading-relaxed">
              Tecnología seleccionada, precios en soles y soporte que responde. Catálogo real,
              stock real.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <FooterColumn title="Tienda">
              {STOREFRONT_NAV.map((item) => (
                <li key={item.href}>
                  <FooterLink href={item.href}>{item.label}</FooterLink>
                </li>
              ))}
            </FooterColumn>

            <FooterColumn title="Categorías">
              {/* Las categorías reales de la base, no una lista escrita a mano que
                  se quede obsoleta en cuanto el admin cree una. */}
              {categories.slice(0, 4).map((category) => (
                <li key={category.id}>
                  <CategoryJumpLink
                    slug={category.slug}
                    className={FOOTER_LINK_CLASS}
                  >
                    {category.name}
                  </CategoryJumpLink>
                </li>
              ))}
            </FooterColumn>

            <FooterColumn title="Cuenta">
              <Show when="signed-out">
                <li>
                  <FooterLink href="/sign-in">Iniciar sesión</FooterLink>
                </li>
                <li>
                  <FooterLink href="/sign-up">Crear cuenta</FooterLink>
                </li>
              </Show>
              <Show when="signed-in">
                <li>
                  <FooterLink href="/admin/products">Administración</FooterLink>
                </li>
              </Show>
            </FooterColumn>
          </div>
        </div>

        <div className="text-nx-faint flex flex-wrap items-center justify-between gap-4 pt-6.5 text-[13px]">
          <p>
            © {year} {APP_NAME}. Todos los derechos reservados.
          </p>
          <p>Precios en soles (PEN), IGV incluido.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-nx-faint mb-2 text-[13px] font-semibold tracking-[0.08em] uppercase">
        {title}
      </h2>
      <ul>{children}</ul>
    </div>
  );
}

// Todos los destinos del pie son ahora rutas —`/#seccion`, `/sign-in`, `/admin/...`—
// y todos pasan por `Link`. Ya no hay anclas relativas al documento actual: desde la
// ficha de producto no existiría la sección a la que apuntaban (spec 005, D-8).
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={FOOTER_LINK_CLASS}>
      {children}
    </Link>
  );
}
