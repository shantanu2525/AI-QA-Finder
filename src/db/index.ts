import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Lazily-initialized database connection.
 *
 * The pool is only created on first use, so importing this module never
 * throws — deploys and builds succeed even before DATABASE_URL is set.
 * An error is raised only when a query actually runs without a URL.
 */
const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run database queries");
  }
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool ??= new Pool({ connectionString: databaseUrl });
    return globalForDb.__arenaNextJsPostgresqlPool;
  }
  return new Pool({ connectionString: databaseUrl });
}

let cachedPool: Pool | null = null;

export function getPool(): Pool {
  cachedPool ??= createPool();
  return cachedPool;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    const client = drizzle(getPool());
    const value = Reflect.get(client, prop, receiver) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
