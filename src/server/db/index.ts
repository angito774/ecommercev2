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
