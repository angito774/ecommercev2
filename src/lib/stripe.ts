// `server-only` rompe el build si alguien importa este módulo desde un componente
// cliente. Sin él, un import por descuido meteria `STRIPE_SECRET_KEY` en el bundle
// del navegador y la clave quedaría publicada (spec 007 §10).
import 'server-only';

import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;

// Se falla al importar, no en la primera petición: un despliegue sin la clave debe
// romper visiblemente y no responder 500 en el primer checkout real.
if (!secretKey) {
  throw new Error('STRIPE_SECRET_KEY no está definida. Copia .env.example a .env.local.');
}

// Una única instancia, y todas las llamadas sobre ella. El patrón global
// (`Stripe.setApiKey`) está deprecado en todos los SDK actuales. Sin `apiVersion`
// explícita: el SDK v22 fija la suya y sobrescribirla desalinearía los tipos
// generados de la respuesta real.
export const stripe = new Stripe(secretKey);
