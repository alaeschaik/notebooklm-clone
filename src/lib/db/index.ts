import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add a Postgres connection string.",
    );
  }
  return url;
}

/** Neon's HTTP driver only speaks to Neon endpoints. */
function isNeon(url: string): boolean {
  return /\.neon\.tech|neon\.build/.test(url);
}

/**
 * Two drivers, chosen by connection string.
 *
 * In production the database is Neon, and its HTTP driver suits the workload:
 * each request is a short burst of queries from a serverless function, where
 * establishing a pooled TCP connection would cost more than it saves.
 *
 * That driver cannot talk to an ordinary Postgres, so local development falls
 * back to node-postgres. This is what lets the project run against a Docker
 * Postgres with no Neon account at all.
 *
 * Created lazily, so importing this module — which Next does while collecting
 * page data at build time — never requires a reachable database.
 */
let cached: Database | undefined;

function create(): Database {
  const url = connectionString();
  const options = { schema, casing: "snake_case" } as const;

  if (!isNeon(url)) return drizzlePg(url, options);

  // Both drivers expose the same Drizzle query builder, and `execute` returns
  // `.rows` on each. Declaring one concrete type keeps the builder's overloads
  // usable — a union of the two collapses them and breaks `.returning()`.
  return drizzleNeon(neon(url), options) as unknown as Database;
}

export function getDb(): Database {
  cached ??= create();
  return cached;
}

export type Database = NodePgDatabase<typeof schema>;

export { schema };
