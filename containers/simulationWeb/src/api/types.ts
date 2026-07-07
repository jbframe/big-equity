/**
 * Wire contract for the simulationAPI data routes, as zod schemas.
 *
 * Hand-mirrors the backend schemas — the source of truth is
 * containers/simulationAPI/src/backend/results.ts and db/schema.ts (ADR-002
 * derives them from the table definition). The backend validates requests at
 * runtime; these schemas let the frontend validate what it sends and what it
 * gets back, so contract drift fails loudly instead of corrupting the UI.
 */

import { z } from "zod";
import type { GameType } from "../gameType";
import type { HiLoResult } from "../sim/engine";

/**
 * Lowercase backend card notation, e.g. "ad", "10c". The UI's display
 * notation ("Ad", "Tc") differs — converting between the two is the
 * consumer's job (see cards.ts), not the client's.
 */
export const apiCardSchema = z
  .string()
  .regex(/^(?:[2-9]|10|[jqka])[cdhs]$/, "expected a card like 'ad' or '10c'");

const highTallySchema = z.object({
  heroWins: z.number().int().nonnegative(),
  villainWins: z.number().int().nonnegative(),
  splits: z.number().int().nonnegative(),
});

const lowTallySchema = highTallySchema.extend({
  noLow: z.number().int().nonnegative(),
});

export const storedResultSchema = z.object({
  id: z.number().int().positive(),
  // Timestamp string over the wire; Postgres text format, not strict ISO —
  // don't feed it to `new Date()` without normalizing.
  createdAt: z.string(),
  source: z.string().min(1),
  heroHand: z.array(apiCardSchema).length(5),
  villainHand: z.array(apiCardSchema).length(5),
  board: z.array(apiCardSchema).max(5),
  simulations: z.number().int().positive(),
  heroEquity: z.number().min(0).max(100),
  high: highTallySchema,
  low: lowTallySchema,
  scoop: z.object({
    hero: z.number().int().nonnegative(),
    villain: z.number().int().nonnegative(),
    none: z.number().int().nonnegative(),
  }),
  noScoop: z.object({
    high: highTallySchema,
    low: lowTallySchema,
  }),
});

export const createResultInputSchema = storedResultSchema.omit({
  id: true,
  createdAt: true,
});

export const listResultsResponseSchema = z.object({
  results: z.array(storedResultSchema),
});

// Mirrors gameTypeSchema/settingsSchema in
// containers/simulationAPI/src/backend/settings.ts and db/schema.ts.
export const gameTypeSchema = z.enum(["big-o", "holdem", "plo"]);
export const settingsSchema = z.object({ gameType: gameTypeSchema });

export const authUserSchema = z.object({
  sub: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
});

export const healthResponseSchema = z.object({ status: z.literal("ok") });

export type ApiCard = z.infer<typeof apiCardSchema>;
export type StoredResult = z.infer<typeof storedResultSchema>;
export type CreateResultInput = z.infer<typeof createResultInputSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Compile-time guard: the wire shape must stay assignable to the sim's own
// result type, so `...simulationResult` spreads keep satisfying the contract.
const _simResultMatchesWire: HiLoResult = {} as CreateResultInput;
void _simResultMatchesWire;

// Same idea for the game type: the wire enum and the UI's GameType union
// must stay interchangeable in both directions.
const _wireGameTypeMatchesUi: GameType = {} as Settings["gameType"];
const _uiGameTypeMatchesWire: Settings["gameType"] = {} as GameType;
void _wireGameTypeMatchesUi;
void _uiGameTypeMatchesWire;
