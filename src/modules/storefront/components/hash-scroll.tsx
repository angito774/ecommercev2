'use client';

import { useEffect } from 'react';

import { STOREFRONT_NAV } from '../constants';

// Los mismos destinos que enlaza el chrome, derivados de la única fuente que ya los
// declara: si mañana se añade una entrada al menú, su ancla queda cubierta sin tocar
// este archivo.
const ANCHOR_IDS = new Set(STOREFRONT_NAV.map((item) => item.href.replace(/^\/#/, '')));

// Al llegar a la portada desde otra ruta con `next/link`, el router intenta el scroll
// al hash contra lo que hay montado en ese instante: el fallback del `<Suspense>` de
// page.tsx, que no tiene ninguno de estos `id`. No reintenta cuando `HomeContent`
// resuelve, así que la URL cambia a `/#catalogo` y la página se queda arriba (AC19).
//
// Este componente solo se monta dentro de `HomeContent`, es decir con las secciones
// reales ya en el DOM, y por eso el `getElementById` sí encuentra el destino. El
// efecto corre una única vez por montaje: en la propia portada, pulsar una entrada
// del header no lo vuelve a ejecutar y el desplazamiento sigue siendo el nativo del
// navegador dentro del mismo documento (AC20).
//
// Sin `behavior: 'smooth'`: en una carga directa con hash el navegador ya ha
// desplazado y esta llamada es idempotente; animarla convertiría ese caso en un
// barrido visible. El `scroll-mt-24` de cada sección lo respetan los dos caminos.
export function HashScroll() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!ANCHOR_IDS.has(id)) return;

    document.getElementById(id)?.scrollIntoView();
  }, []);

  return null;
}
