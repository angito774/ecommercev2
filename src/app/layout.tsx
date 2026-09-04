import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes';
import type { Metadata } from 'next';
import { Geist_Mono, Inter, Roboto, Space_Grotesk } from 'next/font/google';

import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/constants';

import './globals.css';

// Google Sans no está en Google Fonts: es propietaria de Google y no se
// distribuye para uso público, así que no se puede cargar de forma legítima con
// `next/font/google` ni de ninguna otra (decidido con el usuario). Roboto es la
// fuente pública real de Google —la de Android y Material Design— y la que pasa
// a usar el panel admin. `weight` explícito porque, a diferencia de Geist, Roboto
// no es una fuente variable en Google Fonts.
const robotoSans = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Las dos familias del storefront se declaran aquí para que `next/font` las
// autohospede una sola vez, pero solo pasan a estar en uso dentro del scope
// `[data-surface="storefront"]` de globals.css: el panel admin sigue con Geist.
const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
});

const inter = Inter({
  variable: '--font-body',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <ClerkProvider appearance={{ theme: shadcn }}>
      <html
        lang="es"
        suppressHydrationWarning
        className={`${robotoSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
      >
        <body className="flex min-h-full flex-col">
          <Providers>{children}</Providers>
          <Toaster richColors position="top-right" />
        </body>
      </html>
    </ClerkProvider>
  );
}
