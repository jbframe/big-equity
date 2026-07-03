import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Liveness probe for the compose healthcheck, nginx, and monitoring (ADR-002).
export async function healthRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/health",
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
    handler: async (): Promise<HealthResponse> => ({ status: "ok" }),
  });
}
