import { ACCOUNT_SECTIONS } from '@/modules/account/constants';

// Anclas del mismo documento, no `next/link`: el navegador desplaza sin pasar por el
// router y funcionan sin JavaScript (D-5). Los destinos salen de `ACCOUNT_SECTIONS`,
// la misma fuente que da su `id` a cada sección, así que no pueden desalinearse.
//
// Oculto bajo `lg`: en móvil la página es una columna y un rail duplicaría en
// pantalla lo que el scroll ya resuelve (AC12).
export function AccountNav() {
  return (
    <nav aria-label="Secciones de mi cuenta" className="sticky top-24 hidden lg:block">
      <ul className="flex flex-col gap-1">
        {ACCOUNT_SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="text-muted-foreground hover:bg-nx-inset hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
