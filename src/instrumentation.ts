/**
 * Applies pending migrations on boot, so deploying is `docker compose up` and
 * the schema ships with the code expecting it. Set RUN_MIGRATIONS_ON_BOOT=false
 * when more than one instance starts at once.
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
    // Fatal on purpose: a schema the code does not match fails far from here.
    console.error("[migrate] failed to apply migrations", error);
    await getPool().end().catch(() => {});
    throw error;
  }
}
