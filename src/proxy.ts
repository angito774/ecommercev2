import { clerkMiddleware } from '@clerk/nextjs/server';

// Proxy sin lógica de auth, a propósito. Las rutas son públicas por defecto y
// cada recurso protegido se verifica a sí mismo con `await auth.protect()` y
// `requirePermission(<código>)` — ver regla 8 de CLAUDE.md y §6 de docs/SETUP.md.
// clerkMiddleware() y su matcher siguen siendo necesarios para que Clerk resuelva
// la sesión y su ruta de proxy.
export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
