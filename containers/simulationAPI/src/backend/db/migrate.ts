import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { FastifyBaseLogger } from "fastify";
import { db } from "./client.js";

// drizzle/ sits at the package root, three levels up from this file in both
// the src tree (dev) and dist (runtime) — the Docker runtime stage copies it
// alongside dist for exactly this.
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../drizzle", import.meta.url));

// The API and DB run as separate compose projects, so depends_on can't order
// them across the shared network — instead of assuming the DB is up, retry
// with a bound (ADR-003) and let the container restart policy take over if
// the DB still isn't there.
const ATTEMPTS = 10;
const RETRY_DELAY_MS = 3_000;

export async function runMigrations(log: FastifyBaseLogger): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      log.info("database migrations applied");
      return;
    } catch (err) {
      if (attempt >= ATTEMPTS) throw err;
      log.warn(
        { err, attempt, attempts: ATTEMPTS },
        `migration attempt failed; retrying in ${RETRY_DELAY_MS}ms`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}
