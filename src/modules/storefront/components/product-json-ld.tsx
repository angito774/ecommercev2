import { APP_URL } from '@/lib/constants';
import { fromCents } from '@/modules/products/lib/price';
import type { CatalogProduct } from '@/modules/products/types/catalog.types';

// `schema.org/Offer.price` se interpreta en la moneda de `priceCurrency`: publicar
// `45900` con `PEN` afirmaría un precio mil veces mayor. La conversión a unidades
// vive solo aquí, en el punto de serialización, y reutiliza la inversa exacta de
// `toCents` en vez de dividir por 100 otra vez (spec 005, D-13).
const AVAILABILITY: Record<CatalogProduct['stockLevel'], string> = {
  out: 'https://schema.org/OutOfStock',
  low: 'https://schema.org/LimitedAvailability',
  in: 'https://schema.org/InStock',
};

// `</script>` dentro de una cadena del JSON cerraría la etiqueta antes de tiempo.
// Escapar `<` es la defensa estándar y no altera el valor: `<` se decodifica al
// mismo carácter.
function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function ProductJsonLd({ product }: { product: CatalogProduct }) {
  const url = `${APP_URL}/products/${product.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    // Sin `sku`: el identificador de operación no se publica (spec 005, D-6).
    ...(product.description ? { description: product.description } : {}),
    ...(product.imageUrl ? { image: product.imageUrl } : {}),
    category: product.categoryName,
    offers: {
      '@type': 'Offer',
      url,
      price: fromCents(product.priceCents),
      priceCurrency: 'PEN',
      availability: AVAILABILITY[product.stockLevel],
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialize(jsonLd) }}
    />
  );
}
