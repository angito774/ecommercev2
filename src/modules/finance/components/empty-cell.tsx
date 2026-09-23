'use client';

// Un guion con texto accesible, nunca una celda en blanco ni un «S/ 0.00» —que diría «un
// importe de cero», que es otra cosa— ni un `null` pintado (§10).
//
// Extraído aquí, y no copiado por tercera vez, al pedirlo las columnas de los dos
// registros (CLAUDE.md §6: se extrae a la tercera repetición). Se queda en el módulo y no
// en `components/shared/` porque solo sirve a estas tablas. `expense-columns.tsx` conserva
// su propia copia a propósito: el spec 028 congela las tres pantallas financieras
// existentes (§7), así que consolidarla es un cambio de un solo renglón para el día que se
// toque aquel archivo por otro motivo.
export function EmptyCell({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden className="text-muted-foreground">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}
