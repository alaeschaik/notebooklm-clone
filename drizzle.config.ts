import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next reads .env.local automatically; drizzle-kit runs outside Next, so it
// has to be pointed at the same file to avoid a second copy of the URL.
config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
