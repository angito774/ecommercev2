import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Habilita `forbidden()` y `unauthorized()` de next/navigation. Sin este flag
    // ambas lanzan en tiempo de ejecución. Se usa en `requirePagePermission()`
    // (src/lib/auth.ts) para que una página sin permiso renderice su propio 403 en
    // lugar de propagar un ForbiddenError sin capturar.
    authInterrupts: true,
  },
  images: {
    // Lista blanca, no comodín: `hostname: '**'` convierte el optimizador en un
    // proxy abierto a cualquier URL https y su coste de cómputo (spec 004, D-18).
    // `cdn.memorykings.pe` es el host real que usa el admin para las fotos de
    // producto; `images.unsplash.com` queda por las categorías del seed. Un host
    // fuera de esta lista degrada al arte SVG (storefront) o al icono (admin) en
    // vez de romper, pero no muestra la foto real — por eso hay que mantener esta
    // lista al día con los hosts que el admin usa de verdad.
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.memorykings.pe' },
    ],
  },
};

export default nextConfig;
