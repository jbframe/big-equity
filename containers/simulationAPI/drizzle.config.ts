import { defineConfig } from "drizzle-kit";

// drizzle-kit generate reads the schema and diffs it against the SQL already
// in drizzle/ — no database needed. Only db-touching commands (push, studio)
// use the credentials.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://simulation:simulation@localhost:5432/simulation",
  },
});
