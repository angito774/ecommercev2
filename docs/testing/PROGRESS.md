# Progreso de unit testing

Checklist de avance para la creación de la suite de unit tests, siguiendo
`docs/testing/funciones-testeables.md`. Una unidad se completa por iteración:
tests creados + `npm run typecheck && npm run lint && npm run test` en verde.

- [x] 1. `src/lib` (utils, permissions, audit, api-guard)
- [x] 2. `account`
- [x] 3. `audit`
- [ ] 4. `cart`
- [ ] 5. `categories`
- [ ] 6. `orders/lib` (totals, order-history-range, group-orders-by-day)
- [ ] 7. `orders/constants` (mensajes)
- [ ] 8. `orders/schemas`
- [ ] 9. `orders/server-services` (checkout.service, order-fulfillment.service — mocks Stripe/Drizzle)
- [ ] 10. `payments`
- [ ] 11. `products/lib` (price)
- [ ] 12. `products/schemas`
- [ ] 13. `products/repository-helper` (escapeLikePattern)
- [ ] 14. `roles`
- [ ] 15. `storefront`
- [ ] 16. `users`
- [ ] 17. `server/services` (user-access.service, user-sync.service)

## Bloqueado

(vacío — se documenta aquí cualquier decisión que detenga el trabajo)
