import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/constants';

export default function HomePage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-24">
      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{APP_NAME}</h1>
      <p className="text-muted-foreground max-w-prose text-lg">{APP_DESCRIPTION}</p>
      <Button asChild size="lg">
        <Link href="/products">Ver catálogo</Link>
      </Button>
    </section>
  );
}
