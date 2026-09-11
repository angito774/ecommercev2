// Tope por usuario, comprobado antes de crear nada en Stripe: sin él, cada alta
// abandonada a medias engorda la tabla y el Customer del Dashboard, y ese es el
// único momento en que se puede decir que no sin haber creado una sesión (D-18,
// AC15).
export const MAX_SAVED_CARDS = 5;

// Etiqueta del flujo en el Dashboard de Stripe, con el sufijo de 8 letras
// aleatorias que pide la guía. Distinta de `CHECKOUT_INTEGRATION_IDENTIFIER` para
// poder separar las sesiones de alta de las de pago.
export const CARD_SETUP_INTEGRATION_IDENTIFIER = 'account-card-setup-kzrfhwpd';

// El rótulo visible se resuelve aquí y no se guarda en la base: persistir el texto
// ya formateado congelaría el idioma en Postgres (D-11). Lo que no esté en el mapa
// cae al fallback de `cardBrandLabel`.
export const CARD_BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  american_express: 'American Express',
  diners: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  cartes_bancaires: 'Cartes Bancaires',
  eftpos_au: 'Eftpos Australia',
  link: 'Link',
  unknown: 'Tarjeta',
};

export const paymentMethodKeys = {
  all: ['payment-methods'] as const,
  list: () => [...paymentMethodKeys.all, 'list'] as const,
};

// El listado solo cambia cuando el cliente guarda o elimina una tarjeta, y ambas
// invalidan la clave: refetchear en cada foco de la pestaña no compra nada.
export const SAVED_CARDS_STALE_TIME_MS = 30_000;

// Ventana de espera del retorno con `?card=added`. El webhook es eventualmente
// consistente: un `refetch` único al montar enseñaría la lista sin la tarjeta
// recién guardada, y un polling indefinido dejaría la sección girando para siempre
// (D-16, AC13).
export const CARD_SETUP_POLL_INTERVAL_MS = 2_000;
export const CARD_SETUP_MAX_POLLS = 5;

// Se corta antes del tope si aparece una tarjeta creada dentro de esta ventana: es
// la señal de que el webhook ya escribió la fila del alta que acaba de completarse.
export const CARD_SETUP_FRESHNESS_MS = 2 * 60_000;

export const MAX_SAVED_CARDS_MESSAGE = `Ya tienes ${MAX_SAVED_CARDS} tarjetas guardadas, que es el máximo. Elimina una para poder añadir otra.`;

// 404 uniforme: el mismo texto para «no existe» y «no es tuya», que es lo que
// impide enumerar tarjetas ajenas desde la respuesta (D-13, AC9).
export const SAVED_CARD_NOT_FOUND_MESSAGE = 'No encontramos esa tarjeta en tu cuenta.';

export const CARD_SETUP_UPSTREAM_MESSAGE =
  'No se pudo abrir el formulario seguro de Stripe. Vuelve a intentarlo en unos segundos.';

export const CARD_DELETE_UPSTREAM_MESSAGE =
  'No se pudo eliminar la tarjeta en Stripe. Vuelve a intentarlo en unos segundos.';

export const INVALID_CARD_ID_MESSAGE = 'El identificador de la tarjeta no es válido';

// Consentimiento explícito, exigido por Stripe: la sección tiene que decir con
// todas las letras qué se guarda, qué no y para qué (§10). Es copy funcional, no
// decoración.
export const CARD_STORAGE_DISCLOSURE =
  'El número completo lo introduces en una página de Stripe y nunca pasa por esta tienda: de tu tarjeta guardamos solo la marca, los cuatro últimos dígitos y la fecha de caducidad, para que puedas reconocerla y reutilizarla.';
