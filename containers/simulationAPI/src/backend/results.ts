import { and, desc, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "./db/client.js";
import {
  highTallySchema,
  lowTallySchema,
  noScoopSchema,
  scoopTallySchema,
  simulationResults,
} from "./db/schema.js";

// Card notation the simulators use: rank (2-10, j, q, k, a) + suit, e.g.
// "ad", "10c".
const cardSchema = z
  .string()
  .regex(/^(?:[2-9]|10|[jqka])[cdhs]$/, "expected a card like 'ad' or '10c'");

// The generic array/jsonb columns get precise shapes here; everything else
// (ADR-002's share-one-definition goal) is derived from the table by
// drizzle-zod.
const refinements = {
  source: z.string().min(1),
  heroHand: z.array(cardSchema).length(5),
  villainHand: z.array(cardSchema).length(5),
  board: z.array(cardSchema).max(5),
  simulations: z.number().int().positive(),
  heroEquity: z.number().min(0).max(100),
  high: highTallySchema,
  low: lowTallySchema,
  scoop: scoopTallySchema,
  noScoop: noScoopSchema,
};

// `ownerSub` is server-side bookkeeping, not part of the wire contract: it's
// always the caller's own id, so echoing it back tells the client nothing and
// keeps the response identical to what the SPA already expects.
export const resultSchema = createSelectSchema(
  simulationResults,
  refinements,
).omit({ ownerSub: true });

// The identity `id` is already unsettable in the derived insert schema;
// createdAt is the database's to fill, and ownerSub comes from the session
// (see the POST handler) — never the request body, so a client can't create a
// result owned by someone else.
export const createResultSchema = createInsertSchema(
  simulationResults,
  refinements,
).omit({ createdAt: true, ownerSub: true });

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const notFoundSchema = z.object({ message: z.string() });

// The owner of the current request: the signed-in user's `sub`, forwarded by
// the gateway's session guard as x-user-sub (which also deletes any
// client-supplied copy, so this can't be spoofed). The guard refuses
// anonymous callers before any handler runs, so the header is always present
// here; treat a missing one as a wiring bug rather than an anonymous request.
function ownerOf(req: FastifyRequest): string {
  const sub = req.headers["x-user-sub"];
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("missing x-user-sub; auth guard not installed?");
  }
  return sub;
}

// CRUD for simulation results (ADR-003). Results are immutable records of a
// batch run, so there is deliberately no update route.
export async function resultsRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: "POST",
    url: "/results",
    schema: {
      body: createResultSchema,
      response: { 201: resultSchema },
    },
    handler: async (req, reply) => {
      const [row] = await db
        .insert(simulationResults)
        .values({ ...req.body, ownerSub: ownerOf(req) })
        .returning();
      if (!row) {
        throw new Error("insert returned no row");
      }
      return reply.code(201).send(row);
    },
  });

  routes.route({
    method: "GET",
    url: "/results",
    schema: {
      querystring: listQuerySchema,
      response: { 200: z.object({ results: z.array(resultSchema) }) },
    },
    handler: async (req) => {
      const results = await db
        .select()
        .from(simulationResults)
        .where(eq(simulationResults.ownerSub, ownerOf(req)))
        .orderBy(desc(simulationResults.createdAt), desc(simulationResults.id))
        .limit(req.query.limit)
        .offset(req.query.offset);
      return { results };
    },
  });

  routes.route({
    method: "GET",
    url: "/results/:id",
    schema: {
      params: idParamsSchema,
      response: { 200: resultSchema, 404: notFoundSchema },
    },
    handler: async (req, reply) => {
      const [row] = await db
        .select()
        .from(simulationResults)
        .where(
          and(
            eq(simulationResults.id, req.params.id),
            eq(simulationResults.ownerSub, ownerOf(req)),
          ),
        );
      // Someone else's result is indistinguishable from one that doesn't
      // exist: a 404 either way, so ownership can't be probed by id.
      if (!row) {
        return reply.code(404).send({ message: "result not found" });
      }
      return row;
    },
  });

  routes.route({
    method: "DELETE",
    url: "/results/:id",
    schema: {
      params: idParamsSchema,
      response: { 204: z.null(), 404: notFoundSchema },
    },
    handler: async (req, reply) => {
      const deleted = await db
        .delete(simulationResults)
        .where(
          and(
            eq(simulationResults.id, req.params.id),
            eq(simulationResults.ownerSub, ownerOf(req)),
          ),
        )
        .returning({ id: simulationResults.id });
      if (deleted.length === 0) {
        return reply.code(404).send({ message: "result not found" });
      }
      return reply.code(204).send(null);
    },
  });
}
