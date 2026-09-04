'use client';

import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

type ProductThumbnailProps = {
  imageUrl: string | null;
  alt: string;
  size?: number;
};

// Cliente solo por el `onError`: `imageUrl` es texto libre que escribe el admin, y
// un host fuera de `images.remotePatterns` (next.config.ts) hace que el optimizador
// devuelva 400 en tiempo de ejecución, no en el render. Sin este fallback el admin
// vería un hueco en vez de saber que la URL no es servible.
export function ProductThumbnail({ imageUrl, alt, size = 40 }: ProductThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const [lastImageUrl, setLastImageUrl] = useState(imageUrl);

  // En la tabla, `imageUrl` es fijo por fila. En el formulario viene de `watch()` y
  // cambia con cada tecla: sin este reset, un primer intento fallido dejaría el
  // icono fijo aunque el admin corrija la URL después. Se ajusta durante el render
  // (patrón recomendado por React para "reset state on prop change") en vez de un
  // efecto, que dispararía un commit y un render en cascada de más.
  if (imageUrl !== lastImageUrl) {
    setLastImageUrl(imageUrl);
    setFailed(false);
  }

  if (imageUrl === null || failed) {
    return (
      <div
        className="bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-md border"
        style={{ width: size, height: size }}
      >
        <ImageOff className="size-4" aria-hidden />
      </div>
    );
  }

  return (
    // `bg-muted` y `object-contain`: igual que en la tienda, la foto entera queda
    // visible en vez de recortada, sobre el mismo fondo neutro del estado sin
    // imagen — a este tamaño el recorte de `cover` cortaba producto de verdad.
    <div
      className="bg-muted relative shrink-0 overflow-hidden rounded-md border"
      style={{ width: size, height: size }}
    >
      <Image
        src={imageUrl}
        alt={alt}
        fill
        sizes={`${size}px`}
        className="object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
