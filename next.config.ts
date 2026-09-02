import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Habilita `forbidden()` y `unauthorized()` de next/navigation. Sin este flag
    // ambas lanzan en tiempo de ejecución. Se usa en `requirePagePermission()`
    // (src/lib/auth.ts) para que una página sin permiso renderice su propio 403 en
    // lugar de propagar un ForbiddenError sin capturar.
    authInterrupts: true,
  },
};

export default nextConfig;
