import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod";

// Tally shapes mirror what the simulationPY/simulationTS batch jobs produce
// (their SimulationResult): per-runout win counts for the high and low pots,
// scoops, and the no-scoop breakdown. They live here, next to the table, so
// the jsonb columns and the zod route schemas share one definition.

export const highTallySchema = z.object({
  heroWins: z.number().int().nonnegative(),
  villainWins: z.number().int().nonnegative(),
  splits: z.number().int().nonnegative(),
});

export const lowTallySchema = highTallySchema.extend({
  noLow: z.number().int().nonnegative(),
});

export const scoopTallySchema = z.object({
  hero: z.number().int().nonnegative(),
  villain: z.number().int().nonnegative(),
  none: z.number().int().nonnegative(),
});

export const noScoopSchema = z.object({
  high: highTallySchema,
  low: lowTallySchema,
});

export const GAME_TYPES = ["big-o", "holdem"] as const;
export const gameTypeSchema = z.enum(GAME_TYPES);

// Per-user app preferences, keyed by the FusionAuth subject the gateway
// forwards as x-user-sub. FusionAuth stays the sole user store (ADR-006);
// this table only hangs preferences off its id.
export const userSettings = pgTable("user_settings", {
  userSub: text("user_sub").primaryKey(),
  gameType: text("game_type", { enum: GAME_TYPES }).notNull().default("big-o"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const simulationResults = pgTable("simulation_results", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  // Which simulator produced the result, e.g. "simulationTS".
  source: text().notNull(),
  heroHand: text("hero_hand").array().notNull(),
  villainHand: text("villain_hand").array().notNull(),
  board: text().array().notNull(),
  simulations: integer().notNull(),
  // Hero's total pot equity as a percentage (0-100).
  heroEquity: doublePrecision("hero_equity").notNull(),
  high: jsonb().$type<z.infer<typeof highTallySchema>>().notNull(),
  low: jsonb().$type<z.infer<typeof lowTallySchema>>().notNull(),
  scoop: jsonb().$type<z.infer<typeof scoopTallySchema>>().notNull(),
  noScoop: jsonb("no_scoop")
    .$type<z.infer<typeof noScoopSchema>>()
    .notNull(),
  // mode "string" so rows serialize straight to JSON — a Date here can't be
  // represented in the zod-derived response schema.
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
