import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/products(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/products(.*)',
  '/api/categories(.*)',
  '/api/webhooks(.*)',
  // Ruta de proxy de Clerk: si se protege, se rompe el handshake de sesión.
  '/__clerk(.*)',
]);

const isApiRoute = createRouteMatcher(['/api(.*)']);

// El borde solo exige sesión. La autorización fina se resuelve dentro de cada
// Route Handler por código de permiso (requirePermission('products.create')),
// nunca por nombre de rol.
export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // auth.protect() lanza notFound por defecto. Para páginas eso deja al usuario
  // ante un 404 en vez del login, así que se redirige; la API conserva el 404
  // para no devolver HTML a un cliente que espera JSON.
  await auth.protect(
    undefined,
    isApiRoute(req) ? {} : { unauthenticatedUrl: new URL('/sign-in', req.url).toString() },
  );
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
};
