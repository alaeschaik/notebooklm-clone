/**
 * Applies pending database migrations once, when the server boots.
 *
 * Self-hosting this app should be `docker compose up`, not `docker compose up`
 * followed by remembering to exec a migration command. Running them here keeps
 * the schema and the code that expects it deployed together.
 *
 * Set RUN_MIGRATIONS_ON_BOOT=false to manage migrations separately — which is
 * what you would want as soon as more than one instance starts at a time.
 */
export async function register() {
  // Only the Node.js server runtime can reach the database.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_MIGRATIONS_ON_BOOT === "false") return;
  if (!process.env.DATABASE_URL) return;

  const [{ migrate }, { getDb, getPool }] = await Promise.all([
    import("drizzle-orm/node-postgres/migrator"),
    import("@/lib/db"),
  ]);

  try {
    await migrate(getDb(), { migrationsFolder: "./drizzle" });
    console.log("[migrate] database schema is up to date");
  } catch (error) {
    // Deliberately fatal: serving requests against a schema the code does not
    // match produces confusing failures far from the real cause.
    console.error("[migrate] failed to apply migrations", error);
    await getPool().end().catch(() => {});
    throw error;
  }
}
