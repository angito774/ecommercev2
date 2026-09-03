// Marca gráfica de la tienda. Compartida por el header, el footer y el menú móvil,
// que es la tercera repetición y por tanto el momento de extraerla.
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <defs>
        {/* El id lleva prefijo porque un documento puede tener varias marcas a la
            vez y los ids de SVG son globales al documento. */}
        <linearGradient id="nx-brand-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B7EFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#nx-brand-gradient)" />
      <path
        d="M10 22V10l12 12V10"
        stroke="#0A0A0F"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
