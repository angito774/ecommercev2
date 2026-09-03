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
    // Hoy Unsplash es el único host presente en datos. `ProductMedia` degrada al
    // arte SVG cuando la carga falla, así que un host fuera de la lista no rompe.
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },
};

export default nextConfig;
