import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
    );
  }
  return url;
}

/**
 * Neon's HTTP driver suits this workload: every request is a short burst of
 * queries from a serverless function, so a pooled TCP connection would spend
 * more time being established than used.
 *
 * Created lazily so that importing this module — which Next does while
 * collecting page data at build time — never requires the database to exist.
 */
let cached: ReturnType<typeof create> | undefined;

function create() {
  return drizzle(neon(connectionString()), { schema, casing: "snake_case" });
}

export function getDb() {
  cached ??= create();
  return cached;
}

export type Database = ReturnType<typeof create>;
export { schema };
