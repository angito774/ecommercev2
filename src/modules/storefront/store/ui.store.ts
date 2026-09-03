'use client';

import { create } from 'zustand';

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
};

export const useUiStore = create<UiState>((set) => ({
  searchOpen: false,
  cartOpen: false,
  menuOpen: false,
  categoryFilter: 'all',
  searchMounted: false,
  cartMounted: false,
  menuMounted: false,
  searchTrigger: null,
  setSearchTrigger: (searchTrigger) => set({ searchTrigger }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
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
