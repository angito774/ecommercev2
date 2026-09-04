'use client';

import Image from 'next/image';
import { useState } from 'react';

import { CategoryArt } from './category-art';

type ProductMediaProps = {
  imageUrl: string | null;
  alt: string;
  categorySlug: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

// Cliente solo por el `onError`. `imageUrl` es texto libre que escribe el admin: si
// alguien guarda una URL de un host fuera de `remotePatterns`, o que simplemente ha
// dejado de existir, `next/image` falla en tiempo de ejecución. Degradar al arte de
// la categoría es más honesto que confiar en la validación de entrada (§10).
//
// `object-contain`, no `object-cover`: las fotos reales del proveedor son 700×400
// (≈1.75:1) y los marcos de la tienda van de 1:1 a 4:3. Con `cover` el recorte se
// comía bordes del producto y del texto de marca; con `contain` la foto entera
// siempre es visible, escalada dentro del marco, sobre el fondo `nx-art-surface`
// que cada contenedor ya trae para el arte SVG de respaldo.
export function ProductMedia({
  imageUrl,
  alt,
  categorySlug,
  sizes,
  className,
  priority,
}: ProductMediaProps) {
  const [failed, setFailed] = useState(false);

  if (imageUrl === null || failed) {
    return <CategoryArt categorySlug={categorySlug} className={className} />;
  }

  return (
    <Image
      src={imageUrl}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={`object-contain ${className ?? ''}`}
      onError={() => setFailed(true)}
    />
  );
}
