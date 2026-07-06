import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { backend } from "./backend/index.js";
import { requireSession } from "./gateway/auth.js";
import { gateway } from "./gateway/index.js";

// Composition root and nothing else. The container's two roles — the app
// gateway for simulationWeb (allin.…) and the gateway for the API (api.…,
// the CRUD layer in front of simulationDB) — live in src/gateway/ and
// src/backend/, each registering its own plugins and routes, so splitting
// them into separate containers later is a matter of giving each module its
// own entry point. The one piece of cross-role wiring happens here: the
// backend's CRUD routes run behind the gateway's session check, which
// forwards the signed-in user as x-user-* headers.
export async function buildApp() {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>();

  // Every route's schema is written in zod; these compilers make Fastify
  // validate requests and serialize responses straight from those schemas.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(gateway);
  await app.register(backend, { authenticate: requireSession });

  return app;
}
