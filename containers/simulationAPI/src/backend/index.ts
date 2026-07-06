import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import type { FastifyPluginAsync, onRequestAsyncHookHandler } from "fastify";
import { healthRoutes } from "./health.js";
import { resultsRoutes } from "./results.js";
import { settingsRoutes } from "./settings.js";

// The browser front end lives on a different subdomain (ADR-002), so every
// backend response needs CORS headers for this origin. Overridable for the
// local.* aliases (scripts/local-stack.sh).
export const WEB_ORIGIN =
  process.env["WEB_ORIGIN"] ?? "https://allin.makejohnacoffee.com";

export interface BackendOptions {
  // Guard installed in front of every CRUD route. Injected by the
  // composition root so this module stays ignorant of how sessions work
  // (that's the gateway's job) — it relies only on the guard refusing
  // anonymous callers and filling the x-user-* identity headers.
  authenticate: onRequestAsyncHookHandler;
}

// The API-gateway role: the results CRUD API served on api.… plus the
// container liveness probe. CORS is registered here, not in the composition
// root, because only this role is called cross-origin — the gateway routes
// are same-origin with the SPA and need none. Like the gateway module, this
// carries everything it needs to become its own container.
export const backend: FastifyPluginAsync<BackendOptions> = async (
  app,
  opts,
) => {
  // credentials lets the SPA send the session cookie cross-origin — the CRUD
  // routes are useless to it otherwise. methods must be spelled out: the
  // plugin's default only covers the CORS-safelisted GET/HEAD/POST, which
  // makes preflights refuse the PUT (settings) and DELETE (results) routes.
  await app.register(cors, {
    origin: [WEB_ORIGIN],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE"],
  });
  await app.register(healthRoutes);
  // The CRUD routes sit behind the gateway's session check; /health stays
  // outside the wall because the compose healthcheck carries no session. The
  // cookie plugin is registered so the guard can read the session cookie.
  await app.register(async (authed) => {
    await authed.register(cookie);
    authed.addHook("onRequest", opts.authenticate);
    await authed.register(resultsRoutes);
    await authed.register(settingsRoutes);
  });
};
