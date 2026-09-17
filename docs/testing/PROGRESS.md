# Progreso de unit testing

Checklist de avance para la creación de la suite de unit tests, siguiendo
`docs/testing/funciones-testeables.md`. Una unidad se completa por iteración:
tests creados + `npm run typecheck && npm run lint && npm run test` en verde.

- [x] 1. `src/lib` (utils, permissions, audit, api-guard)
- [x] 2. `account`
- [x] 3. `audit`
- [x] 4. `cart`
- [x] 5. `categories`
- [x] 6. `orders/lib` (totals, order-history-range, group-orders-by-day)
- [x] 7. `orders/constants` (mensajes)
- [x] 8. `orders/schemas`
- [x] 9. `orders/server-services` (checkout.service, order-fulfillment.service — mocks Stripe/Drizzle)
- [x] 10. `payments`
- [x] 11. `products/lib` (price)
- [x] 12. `products/schemas`
- [x] 13. (vacía — `escapeLikePattern` movida a la unidad 1, `lib/utils.ts`, spec 014 D-9)
- [x] 14. `roles`
- [x] 15. `storefront`
- [x] 16. `users`
- [x] 17. `server/services` (user-access.service, user-sync.service)

## Bloqueado

(vacío — se documenta aquí cualquier decisión que detenga el trabajo)

## COMPLETADO (2026-09-13 17:28 UTC)

Las 17 unidades de la suite de unit testing están completas. `npm run
typecheck && npm run lint && npm run test && npm run build` en verde de punta
a punta.
