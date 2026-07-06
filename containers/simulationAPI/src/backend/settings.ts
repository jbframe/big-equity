import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "./db/client.js";
import { gameTypeSchema, userSettings } from "./db/schema.js";
import { userSub } from "./identity.js";

// The wire shape is just the preferences themselves — the row's key is the
// caller's own identity (x-user-sub, filled by the auth guard), so it never
// travels in a body or URL.
export const settingsSchema = z.object({ gameType: gameTypeSchema });

const DEFAULT_SETTINGS: z.infer<typeof settingsSchema> = { gameType: "big-o" };

// Per-user settings: a GET that always answers (defaults before first save)
// and an idempotent PUT upsert. No DELETE — resetting is PUTting defaults.
export async function settingsRoutes(app: FastifyInstance) {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.route({
    method: "GET",
    url: "/settings",
    schema: {
      response: { 200: settingsSchema },
    },
    handler: async (req) => {
      const [row] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userSub, userSub(req)));
      return row ? { gameType: row.gameType } : DEFAULT_SETTINGS;
    },
  });

  routes.route({
    method: "PUT",
    url: "/settings",
    schema: {
      body: settingsSchema,
      response: { 200: settingsSchema },
    },
    handler: async (req) => {
      const [row] = await db
        .insert(userSettings)
        .values({ userSub: userSub(req), gameType: req.body.gameType })
        .onConflictDoUpdate({
          target: userSettings.userSub,
          set: { gameType: req.body.gameType, updatedAt: sql`now()` },
        })
        .returning();
      if (!row) {
        throw new Error("upsert returned no row");
      }
      return { gameType: row.gameType };
    },
  });
}
