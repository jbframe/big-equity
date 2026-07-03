import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { healthRoutes } from "./health.js";

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
  await app.register(healthRoutes);

  return app;
}
