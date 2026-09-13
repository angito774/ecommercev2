import { config } from 'dotenv';

// `src/server/db/index.ts` valida `DATABASE_URL` en el propio import (igual que
// documenta `src/server/db/seed.ts`), así que cualquier test que importe —directa o
// transitivamente— un módulo de `src/lib` que toque `@/server/db` (p. ej. `audit.ts`
// o `auth.ts`, de donde sale `UnauthorizedError`) revienta al cargar el archivo si
// el proceso de Vitest no tiene las variables de entorno. Ninguna prueba de esta
// unidad hace I/O real: el Pool de Neon no abre conexión al construirse, solo al
// primer query. Cargar `.env.local` aquí evita ese reventón sin mockear nada.
config({ path: '.env.local' });
