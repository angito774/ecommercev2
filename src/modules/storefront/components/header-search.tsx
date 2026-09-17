'use client';

import { Command as CommandPrimitive } from 'cmdk';
import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { Command } from '@/components/ui/command';
import { useDebounce } from '@/hooks/use-debounce';
import { CATALOG_SEARCH_LIMIT, SEARCH_DEBOUNCE_MS } from '@/modules/products/constants';
import { useCatalogProducts } from '@/modules/products/hooks/use-catalog-products';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

import { useAnimatedPlaceholder } from '../hooks/use-animated-placeholder';
import { useUiStore } from '../store/ui.store';
import { HeaderSearchResults } from './header-search-results';

type HeaderSearchProps = {
  // El ref lo inyecta el header: es quien registra `⌘K` y quien sabe cuál de las dos
  // instancias está visible en cada breakpoint (D-8).
  inputRef: RefObject<HTMLInputElement | null>;
  className?: string;
};

// Lo que oye un lector de pantalla cuando la consulta se asienta. Fuera del componente
// porque no depende de nada suyo y así el encadenado de condiciones no se lee dentro
// del JSX.
function buildLiveMessage(
  term: string,
  state: { isFetching: boolean; isError: boolean; count: number },
): string {
  if (term.length === 0 || state.isFetching) return '';
  if (state.isError) return `No se pudo buscar «${term}».`;
  if (state.count === 0) return `Sin resultados para «${term}».`;
  return `${state.count} ${state.count === 1 ? 'resultado' : 'resultados'} para «${term}».`;
}

// Autocomplete en línea, no modal. Se conserva `cmdk` por lo que aporta sin
// `Dialog` —`role=combobox`, `aria-activedescendant`, `role=option` y la navegación
// con ↑ ↓ Home End Enter— y se deja fuera lo único que traía el `Dialog`: trampa de
// foco, bloqueo de scroll y overlay (spec 019, D-1).
export function HeaderSearch({ inputRef, className }: HeaderSearchProps) {
  const router = useRouter();
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);
  const setCatalogQuery = useUiStore((state) => state.setCatalogQuery);

  const containerRef = useRef<HTMLDivElement>(null);
  const listIdRef = useRef<string | null>(null);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const placeholder = useAnimatedPlaceholder(focused || term.length > 0);

  const trimmed = term.trim();
  // El debounce vive aquí y no en el panel: `HeaderSearchResults` se monta al abrirse,
  // así que un `useDebounce` suyo nacería con el término ya escrito y la primera
  // pulsación —y cada reapertura— consultaría sin esperar los 300 ms (AC2).
  const debouncedTerm = useDebounce(trimmed, SEARCH_DEBOUNCE_MS);

  // Contra la API y no filtrando el array ya cargado: el cliente solo tiene la primera
  // página, así que buscar en ella daría «sin resultados» para productos que sí
  // existen (spec 004, D-13).
  const query = useCatalogProducts(
    { q: debouncedTerm, page: 1, pageSize: CATALOG_SEARCH_LIMIT, sort: 'featured' },
    { enabled: open && debouncedTerm.length > 0 },
  );

  const results = open && debouncedTerm.length > 0 ? (query.data?.data ?? []) : [];
  const pending = debouncedTerm.length === 0 || (query.isFetching && results.length === 0);
  const liveMessage = open
    ? buildLiveMessage(debouncedTerm, {
        isFetching: query.isFetching,
        isError: query.isError,
        count: results.length,
      })
    : '';

  // `cmdk` esparce las props del consumidor ANTES de sus propios atributos, así que
  // fija `aria-expanded="true"` en el input y ninguna prop puede sobrescribirlo.
  // Anunciar «expandido» con el panel cerrado es una mentira al lector de pantalla
  // (WCAG 4.1.2), así que este efecto lo corrige a mano (D-4).
  //
  // Ambos atributos se escriben con `setAttribute`/`removeAttribute`, fuera del
  // renderizado de React: como cmdk pasa siempre el mismo `aria-expanded={true}`,
  // React nunca vuelve a tocar ese atributo por su cuenta (su diff solo escribe en
  // el DOM cuando el valor de la prop cambia entre renders), así que nuestra
  // escritura imperativa no compite con la suya en el siguiente commit. Por lo
  // mismo, `aria-controls` apunta al `CommandList`, que solo existe en el DOM con
  // el panel abierto: al cerrarlo se retira a mano y React tampoco lo restituye al
  // reabrir. Sin array de dependencias porque el efecto solo depende de `open`
  // -leído del cierre- y de dos refs estables; declararlas no cambiaría nada.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    listIdRef.current ??= input.getAttribute('aria-controls');
    const listId = listIdRef.current;
    if (open && listId !== null) {
      input.setAttribute('aria-controls', listId);
      return;
    }
    input.removeAttribute('aria-controls');
  });

  // Clic fuera del buscador. `pointerdown` y no `click`: cierra antes de que el
  // navegador procese la pulsación, así que el primer clic fuera ya hace lo suyo en
  // vez de gastarse en cerrar el panel (D-6).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const handleValueChange = (value: string) => {
    setTerm(value);
    setOpen(value.trim().length > 0);
  };

  // `cmdk` no maneja `Escape` —lo resolvía el `Dialog`—, así que es nuestro.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (open) {
      // Conserva el término: cerrar el panel no es descartar la búsqueda (AC5).
      setOpen(false);
      return;
    }
    setTerm('');
  };

  // Tabular fuera cierra el panel sin robar el foco ni devolverlo a ningún
  // disparador: aquí no hay disparador al que volver (AC6).
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setFocused(false);
    setOpen(false);
  };

  const handleClear = () => {
    setTerm('');
    setOpen(false);
    inputRef.current?.focus();
  };

  // Elegir un resultado lleva a ese producto y nunca añade al carrito: buscar es una
  // pregunta, no una compra. El término se conserva en el campo (D-14).
  const handleSelectProduct = (product: CatalogProduct) => {
    setOpen(false);
    router.push(`/products/${product.slug}`);
  };

  // Ítem de reserva. Aplica el término al catálogo y navega con el router, no con un
  // `<a>`: la recarga completa perdería el estado que se acaba de poner (spec 004,
  // D-10).
  const handleSeeAllInCatalog = () => {
    setCatalogQuery(term.trim());
    // El término manda sobre la categoría que hubiera puesta antes; si no, la rejilla
    // cruzaría dos filtros que el visitante no pidió a la vez.
    setCategoryFilter('all');
    setOpen(false);
    router.push('/#catalogo');
  };

  return (
    <div
      ref={containerRef}
      role="search"
      className={className}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {/* `shouldFilter={false}` porque el filtrado lo hace Postgres con `ilike`: si
          cmdk volviera a filtrar por su cuenta descartaría resultados que el servidor
          sí considera coincidencias. `label` genera el `<label hidden>` que da nombre
          accesible al input sin añadir markup (AC8). */}
      {/* `vimBindings={false}`: con el panel abierto, el binding vim propio de cmdk
          captura `Ctrl+K` para mover la selección y se comería el atajo de enfoque que
          registra `storefront-header` (AC7). */}
      <Command
        label="Buscar productos"
        shouldFilter={false}
        vimBindings={false}
        className="overflow-visible bg-transparent p-0"
      >
        <div className="relative">
          <Search
            className="text-primary pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
            aria-hidden
          />
          {/* La primitiva de cmdk y no el `CommandInput` de shadcn: ese envuelve el
              campo en un `InputGroup h-8!` con chrome de paleta de comandos que el
              `className` del consumidor no alcanza (D-2).

              `text-base` bajo `md`: iOS Safari hace zoom al enfocar un campo con
              fuente menor de 16 px y con el header pegajoso deja la página
              descuadrada (D-10, AC9). */}
          <CommandPrimitive.Input
            ref={inputRef}
            value={term}
            onValueChange={handleValueChange}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            enterKeyHint="search"
            autoComplete="off"
            className="border-nx-line bg-card placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/35 h-11 w-full rounded-full border pr-14 pl-10 text-base outline-none focus-visible:ring-[3px] md:text-sm"
          />
          {term.length > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Limpiar búsqueda"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-0 grid size-11 -translate-y-1/2 place-items-center rounded-full"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
          {/* La pista del atajo solo tiene sentido mientras no se está usando el campo:
              con el foco dentro, el atajo ya se cumplió y el adorno estorba. */}
          {term.length === 0 && !focused ? (
            <kbd
              aria-hidden
              className="bg-secondary border-border text-nx-faint pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border px-1.5 py-1 text-[11px] font-semibold md:block"
            >
              ⌘K
            </kbd>
          ) : null}

          {open ? (
            // Anclado al campo, sin portal y sin telón: la página sigue
            // desplazándose y el resto de la interfaz sigue siendo clicable (AC2).
            //
            // `onMouseDown` con `preventDefault`: pulsar sobre el panel movería el
            // foco fuera del input, el `focusout` cerraría el panel y el `click`
            // llegaría a un nodo ya desmontado, así que el resultado nunca se
            // elegiría con el ratón.
            <div
              onMouseDown={(event) => event.preventDefault()}
              className="border-border bg-popover text-popover-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border shadow-[var(--nx-shadow-lg)] motion-safe:duration-150"
            >
              <HeaderSearchResults
                term={trimmed}
                debouncedTerm={debouncedTerm}
                results={results}
                pending={pending}
                errorMessage={query.isError ? query.error.message : null}
                onSelectProduct={handleSelectProduct}
                onSeeAllInCatalog={handleSeeAllInCatalog}
              />
            </div>
          ) : null}
        </div>
      </Command>

      {/* Siempre montada, no solo con el panel abierto: una región que nace junto con
          su contenido no se anuncia de forma fiable en varios lectores de pantalla.
          Fuera del `Command` porque el `CommandList` es el `role="listbox"` del
          combobox y un nodo de estado dentro no sería un `option` válido (AC8). */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>
    </div>
  );
}
