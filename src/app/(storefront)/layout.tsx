import type { ReactNode } from 'react';

// Shell de la tienda: header y footer los añade el spec del storefront.
export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
