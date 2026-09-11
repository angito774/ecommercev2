'use client';

import { create } from 'zustand';

import type { CatalogQueryParams } from '@/modules/products/schemas/catalog.schema';

// El tipo sale del schema Zod del endpoint, no de una unión reescrita a mano: si
// mañana se añade un orden nuevo al contrato, este store deja de compilar hasta
// que lo contemple (CLAUDE.md regla 5, aplicada al contrato de API).
type CatalogSort = CatalogQueryParams['sort'];

// Estado de UI puro, que la regla 6 de docs/SETUP.md asigna a Zustand. Vive en un
// store y no en el header porque el disparador está arriba del árbol y el panel al
// final: con `useState` el estado subiría al layout y convertiría en cliente todo
// lo que hay en medio, contra la regla 7 (spec 004, D-16).
type UiState = {
  searchOpen: boolean;
  cartOpen: boolean;
  menuOpen: boolean;
  // Slug de la categoría filtrada en el catálogo, o 'all'. Vive aquí y no dentro de
  // `catalog-section` porque hay tres disparadores repartidos por la página —el
  // marquee, la rejilla de categorías y el buscador— y todos tienen que poder
  // cambiarlo sin que el estado suba hasta la portada.
  categoryFilter: string;
  // Término de búsqueda aplicado al catálogo, o cadena vacía. Lo escribe el ítem
  // de reserva del buscador («Ver … en el catálogo») y lo limpia el chip de la
  // rejilla: sin él, «navegar al catálogo con el filtro aplicado» no sería cierto
  // y el visitante que busca «ssd» aterrizaría en el catálogo completo (D-10).
  //
  // Es estado de UI, no datos de servidor: los resultados siguen viniendo de
  // TanStack Query, que recibe este término como parámetro (SETUP §4, regla 6).
  catalogQuery: string;
  // Orden y página de la rejilla del catálogo. Viven aquí por el mismo motivo que
  // los dos de arriba: los cambia el desplegable, pero también hay que poder
  // resetearlos desde cualquier disparador de filtro repartido por la página.
  catalogSort: CatalogSort;
  catalogPage: number;
  // Pestillos de montaje: pasan a true la primera vez que se abre cada overlay y ya
  // no vuelven atrás. Viven en el store, y no en un ref del componente, porque
  // derivarlos durante el render obligaría a leer y escribir una referencia
  // mutable en pleno render, que es lo que prohíbe `react-hooks/refs`.
  //
  // Hacen falta en las dos direcciones: montar solo mientras `open` es true haría
  // desaparecer el overlay antes de que Radix devuelva el foco al disparador (AC10),
  // y montarlos siempre descargaría los tres chunks diferidos al hidratar (D-17).
  searchMounted: boolean;
  cartMounted: boolean;
  menuMounted: boolean;
  // Elemento al que devolver el foco cuando se cierra el buscador. Radix lo hace
  // solo cuando el disparador y el contenido están conectados de forma nativa
  // (`Dialog.Trigger`), pero aquí el diálogo se monta ya abierto por el pestillo de
  // carga diferida, así que nunca llega a registrar quién tenía el foco antes y al
  // cerrar con `Esc` este caía al `<body>` (AC10). Se guarda a mano.
  //
  // Es una referencia al DOM, no estado de render: nadie se suscribe a ella y por
  // eso no provoca re-renders.
  searchTrigger: HTMLElement | null;
  setSearchTrigger: (element: HTMLElement | null) => void;
  setSearchOpen: (open: boolean) => void;
  setCartOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
  setCategoryFilter: (slug: string) => void;
  setCatalogQuery: (query: string) => void;
  setCatalogSort: (sort: CatalogSort) => void;
  setCatalogPage: (page: number) => void;
};

export const useUiStore = create<UiState>((set) => ({
  searchOpen: false,
  cartOpen: false,
  menuOpen: false,
  categoryFilter: 'all',
  catalogQuery: '',
  catalogSort: 'featured',
  catalogPage: 1,
  searchMounted: false,
  cartMounted: false,
  menuMounted: false,
  searchTrigger: null,
  setSearchTrigger: (searchTrigger) => set({ searchTrigger }),
  // Cambiar categoría, término u orden devuelve la rejilla a la página 1, y el
  // reset vive en el propio setter, no en un efecto de `catalog-section`. Hay
  // cinco disparadores del filtro repartidos por la tienda —chips, sidebar,
  // marquee, buscador y mega-menú— y con el invariante en el setter ninguno puede
  // saltárselo; en un efecto se olvida en cuanto aparezca el sexto. Sin él, filtrar
  // desde la página 3 pediría la página 3 de un resultado que quizá tiene una.
  setCategoryFilter: (categoryFilter) => set({ categoryFilter, catalogPage: 1 }),
  setCatalogQuery: (catalogQuery) => set({ catalogQuery, catalogPage: 1 }),
  setCatalogSort: (catalogSort) => set({ catalogSort, catalogPage: 1 }),
  setCatalogPage: (catalogPage) => set({ catalogPage }),
  // Abrir un overlay cierra los otros dos: dos capas modales a la vez dejan la
  // trampa de foco peleándose consigo misma y `Esc` cerrando la equivocada. El
  // pestillo de montaje solo se arma al abrir, nunca se desarma al cerrar.
  setSearchOpen: (searchOpen) =>
    set((state) => ({
      searchOpen,
      cartOpen: false,
      menuOpen: false,
      searchMounted: state.searchMounted || searchOpen,
    })),
  setCartOpen: (cartOpen) =>
    set((state) => ({
      cartOpen,
      searchOpen: false,
      menuOpen: false,
      cartMounted: state.cartMounted || cartOpen,
    })),
  setMenuOpen: (menuOpen) =>
    set((state) => ({
      menuOpen,
      searchOpen: false,
      cartOpen: false,
      menuMounted: state.menuMounted || menuOpen,
    })),
}));
