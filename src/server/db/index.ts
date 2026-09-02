import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida. Copia .env.example a .env.local.');
}

// neon-serverless (WebSocket) en lugar de neon-http: audit_logs debe escribirse
// dentro de la misma transacción que la mutación auditada, y el driver HTTP no
// soporta transacciones interactivas.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Db = typeof db;

// Handle de la transacción interactiva. Los mutadores y `logAudit` lo reciben como
// parámetro para que sea imposible escribir la bitácora fuera de la transacción de
// la mutación auditada (docs/SETUP.md §5.2, regla dura 2).
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Handle de solo lectura. Una lectura que alimenta el `before` de la bitácora debe
// correr dentro de la transacción de la mutación para ver el mismo estado que el
// UPDATE; el resto de llamadores sigue usando el `db` global sin enterarse.
export type Reader = Db | Tx;
