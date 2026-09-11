import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.",
    );
  }
  return url;
}

/**
 * A pooled connection, because this runs as a long-lived server rather than as
 * per-request functions: the cost of establishing a connection is paid once and
 * amortised over every request that follows.
 *
 * Created lazily so that importing this module — which Next does while
 * collecting page data during the build — never requires a reachable database.
 */
let cached: Database | undefined;
let pool: Pool | undefined;

export function getPool(): Pool {
  pool ??= new Pool({
    connectionString: connectionString(),
    // Comfortably under Postgres' default max_connections of 100, leaving room
    // for migrations and a psql session without exhausting the server.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export function getDb(): Database {
  cached ??= drizzle(getPool(), { schema, casing: "snake_case" });
  return cached;
}

export type Database = NodePgDatabase<typeof schema>;
export { schema };
