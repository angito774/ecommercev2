import type { ReactElement } from 'react';

// Arte de producto en SVG inline, heredado de docs/design. Las clases `nx-a*` las
// resuelve globals.css contra los tokens del tema, así que el mismo dibujo se ve
// bien en claro y en oscuro sin duplicar el marcado.
//
// Está indexado por slug de CATEGORÍA, no por producto: en el diseño el arte
// estaba atado a 10 productos inventados; aquí cubre el catálogo real completo
// (spec 004, D-19). Es JSX estático y por eso vive fuera de constants.ts.

const laptop = (
  <>
    <rect className="nx-a1" x="38" y="46" width="124" height="86" rx="8" />
    <rect className="nx-a3" x="46" y="54" width="108" height="70" rx="4" />
    <path className="nx-a2" d="M18 140h164l-9 14a8 8 0 0 1-6.6 3.4H33.6A8 8 0 0 1 27 154Z" />
    <rect className="nx-a4" x="84" y="140" width="32" height="4" rx="2" />
  </>
);

const phone = (
  <>
    <rect className="nx-a1" x="60" y="18" width="80" height="164" rx="18" />
    <rect className="nx-a3" x="67" y="25" width="66" height="150" rx="13" />
    <rect className="nx-a4" x="88" y="31" width="24" height="5" rx="2.5" />
    <circle className="nx-a2" cx="82" cy="56" r="9" />
    <circle className="nx-a2" cx="82" cy="78" r="9" />
  </>
);

const monitor = (
  <>
    <rect className="nx-a1" x="20" y="34" width="160" height="104" rx="10" />
    <rect className="nx-a3" x="29" y="43" width="142" height="86" rx="5" />
    <path className="nx-a2" d="M88 138h24v22H88Z" />
    <rect className="nx-a2" x="62" y="160" width="76" height="10" rx="5" />
    <circle className="nx-a4" cx="100" cy="133" r="2.5" />
  </>
);

const keyboard = (
  <>
    <rect className="nx-a1" x="16" y="62" width="168" height="76" rx="12" />
    <g className="nx-a3">
      <rect x="28" y="74" width="18" height="15" rx="4" />
      <rect x="50" y="74" width="18" height="15" rx="4" />
      <rect x="72" y="74" width="18" height="15" rx="4" />
      <rect x="94" y="74" width="18" height="15" rx="4" />
      <rect x="116" y="74" width="18" height="15" rx="4" />
      <rect x="138" y="74" width="18" height="15" rx="4" />
      <rect x="160" y="74" width="12" height="15" rx="4" />
      <rect x="28" y="93" width="24" height="15" rx="4" />
      <rect x="56" y="93" width="18" height="15" rx="4" />
      <rect x="78" y="93" width="18" height="15" rx="4" />
      <rect x="100" y="93" width="18" height="15" rx="4" />
      <rect x="122" y="93" width="18" height="15" rx="4" />
      <rect x="144" y="93" width="28" height="15" rx="4" />
      <rect x="28" y="112" width="18" height="15" rx="4" />
      <rect x="50" y="112" width="18" height="15" rx="4" />
      <rect x="72" y="112" width="56" height="15" rx="4" />
      <rect x="132" y="112" width="18" height="15" rx="4" />
      <rect x="154" y="112" width="18" height="15" rx="4" />
    </g>
  </>
);

const gpu = (
  <>
    <rect className="nx-a1" x="18" y="58" width="164" height="84" rx="10" />
    <circle className="nx-a3" cx="66" cy="100" r="27" />
    <circle className="nx-a3" cx="136" cy="100" r="27" />
    <circle className="nx-a4" cx="66" cy="100" r="9" />
    <circle className="nx-a4" cx="136" cy="100" r="9" />
    <path className="nx-a2" d="M30 142h18v16H30ZM152 142h18v16h-18Z" />
  </>
);

const storage = (
  <>
    <rect className="nx-a1" x="26" y="66" width="148" height="68" rx="10" />
    <rect className="nx-a3" x="38" y="78" width="72" height="44" rx="6" />
    <circle className="nx-a4" cx="132" cy="88" r="6" />
    <circle className="nx-a4" cx="152" cy="88" r="6" />
    <path className="nx-a2" d="M124 108h40v10h-40Z" />
    <path className="nx-a2" d="M46 134h14v18H46ZM140 134h14v18h-14Z" />
  </>
);

const tablet = (
  <>
    <rect className="nx-a1" x="44" y="24" width="112" height="152" rx="14" />
    <rect className="nx-a3" x="54" y="38" width="92" height="120" rx="6" />
    <circle className="nx-a4" cx="100" cy="167" r="5" />
    <rect className="nx-a2" x="88" y="30" width="24" height="4" rx="2" />
  </>
);

const CATEGORY_ART: Record<string, ReactElement> = {
  laptops: laptop,
  smartphones: phone,
  monitores: monitor,
  perifericos: keyboard,
  'componentes-de-pc': gpu,
  almacenamiento: storage,
  tablets: tablet,
};

type CategoryArtProps = {
  categorySlug: string;
  className?: string;
};

// `aria-hidden`: es decoración que sustituye a una foto que no existe. El nombre
// del producto ya está en el texto de la tarjeta, así que anunciarlo otra vez por
// el lector de pantalla sería ruido.
export function CategoryArt({ categorySlug, className }: CategoryArtProps) {
  return (
    <svg viewBox="0 0 200 200" className={`nx-art ${className ?? ''}`} aria-hidden="true">
      {CATEGORY_ART[categorySlug] ?? laptop}
    </svg>
  );
}
