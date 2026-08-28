import type { ReactNode } from 'react';

import { SiteHeader } from '@/components/shared/site-header';

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
