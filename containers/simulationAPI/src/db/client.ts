import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

// On the box, DATABASE_URL is written into .env by the deploy pipeline from
// the SIMULATIONDB_PASSWORD secret (ADR-003), pointing at the simulationdb
// container over the shared docker network. The fallback matches a plain
// local `docker run postgres` for development.
const DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgresql://simulation:simulation@localhost:5432/simulation";

// pg.Pool connects lazily, so importing this module never touches the
// network — only queries (and the startup migration) do.
export const pool = new pg.Pool({ connectionString: DATABASE_URL });

export const db = drizzle(pool, { schema });
