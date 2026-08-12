import { defineConfig } from "drizzle-kit";

/**
 * Generates plain SQL migration files from src/db/schema.ts into ./drizzle.
 * Those .sql files are the single source of truth for the database shape —
 * they are applied by both drivers:
 *   - Node tests, via drizzle-orm's better-sqlite3 migrator (src/db/testDb.ts)
 *   - the real app, via the Tauri SQL plugin's migration list (src-tauri/src/lib.rs)
 *
 * Run `npm run db:generate` after any change to schema.ts.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
