'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

// Sin estado de montaje. El tema real no se conoce en el servidor, así que elegir
// el icono en JavaScript obliga a un `mounted` que o parpadea o provoca un mismatch
// de hidratación. Aquí se renderizan los dos y decide el CSS a partir de la clase
// `.dark` que next-themes pone en <html>: el HTML es idéntico en servidor y cliente
// y el icono correcto está pintado desde el primer frame.
//
// `resolvedTheme` solo se consulta dentro del manejador, que nunca corre en el
// servidor, así que no participa en el render.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-foreground size-11 shrink-0 rounded-full"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Cambiar entre tema claro y oscuro"
    >
      <Sun className="size-5 dark:hidden" aria-hidden />
      <Moon className="hidden size-5 dark:block" aria-hidden />
    </Button>
  );
}
