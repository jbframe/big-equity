import cookie from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";

// The app-gateway role: everything serving the allin.… hostname — the OIDC
// login flow against FusionAuth, the signed session cookie (ADR-007), and
// the session-gated SPA proxy (ADR-010). The cookie plugin is registered
// here, not in the composition root, because only this role uses cookies —
// the module carries everything it needs to become its own container.
export async function gateway(app: FastifyInstance): Promise<void> {
  await app.register(cookie);
  await app.register(authRoutes);
}
