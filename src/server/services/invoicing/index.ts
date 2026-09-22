import type { InvoicingProvider } from './provider';

let instance: InvoicingProvider | null = null;

/**
 * Único punto del servidor que decide **qué** proveedor se usa, y por eso el único que
 * nombra a Nubefact fuera de su propio archivo: el service pide «el proveedor» y recibe la
 * interfaz (D-1). Cambiar de OSE/PSE es cambiar el módulo que se importa aquí.
 *
 * El `import()` es **dinámico y no estático**, y esa es la parte que importa. La cadena
 * `nubefact.provider → invoicing-config` lanza al cargarse si falta cualquier variable del
 * emisor (D-18), y con un import estático esa cadena entraría en el grafo de
 * `order-fulfillment.service.ts`, es decir, en el del webhook de Stripe: un despliegue sin
 * las credenciales de Nubefact dejaría de **fulfillar pedidos pagados**, que es mucho peor
 * que no poder emitir. Encolar el comprobante no necesita al proveedor (AC7, D-7), así que
 * tampoco necesita su configuración; cargarlo perezosamente es lo que lo deja escrito en el
 * grafo de módulos y no solo en un comentario.
 *
 * Memoizado tras la primera llamada, igual que la instancia de Stripe.
 */
export async function getInvoicingProvider(): Promise<InvoicingProvider> {
  if (!instance) {
    const { NubefactProvider } = await import('./nubefact.provider');
    instance = new NubefactProvider();
  }

  return instance;
}
