import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { authRoutes } from "./auth.js";
import { healthRoutes } from "./health.js";
import { resultsRoutes } from "./results.js";

// The browser front end lives on a different subdomain (ADR-002), so every
// response needs CORS headers for this origin.
export const WEB_ORIGIN = "https://allin.makejohnacoffee.com";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Every route's schema is written in zod; these compilers make Fastify
  // validate requests and serialize responses straight from those schemas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: [WEB_ORIGIN] });
  // Cookie support underpins the OIDC session (ADR-007); the auth routes are
  // the login wall for the simulationWeb SPA, enforced by nginx auth_request.
  await app.register(cookie);
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(resultsRoutes);

  return app;
}
