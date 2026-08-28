import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/products(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/products(.*)',
  '/api/categories(.*)',
  '/api/webhooks(.*)',
]);

// El borde solo exige sesión. La autorización fina se resuelve dentro de cada
// Route Handler por código de permiso (requirePermission('products.create')),
// nunca por nombre de rol.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
