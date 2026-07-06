import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.js";
import { resultsRoutes } from "./results.js";

// The browser front end lives on a different subdomain (ADR-002), so every
// backend response needs CORS headers for this origin.
export const WEB_ORIGIN = "https://allin.makejohnacoffee.com";

// The API-gateway role: the results CRUD API served on api.… plus the
// container liveness probe. CORS is registered here, not in the composition
// root, because only this role is called cross-origin — the gateway routes
// are same-origin with the SPA and need none. Like the gateway module, this
// carries everything it needs to become its own container.
export async function backend(app: FastifyInstance): Promise<void> {
  await app.register(cors, { origin: [WEB_ORIGIN] });
  await app.register(healthRoutes);
  await app.register(resultsRoutes);
}
