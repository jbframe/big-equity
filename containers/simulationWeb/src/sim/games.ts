/**
 * Showdown rules per game variant.
 *
 * These are the rules the simulation engine needs; UI-level configuration
 * (labels, hand sizes, default hands) lives in `gameType.ts`, keyed by the
 * same `GameType`. Adding a variant means adding an entry to each.
 */

import type { GameType } from "../gameType";

export interface GameRules {
  /**
   * Omaha-family games must use exactly 2 hole cards plus 3 board cards;
   * `null` means any 5 of the available cards (Hold'em's best-of-seven).
   */
  mustUseHoleCards: 2 | null;
  /** Whether an 8-or-better low pot is contested alongside the high pot. */
  hiLo: boolean;
}

export const GAME_RULES: Record<GameType, GameRules> = {
  "big-o": { mustUseHoleCards: 2, hiLo: true },
  holdem: { mustUseHoleCards: null, hiLo: false },
  plo: { mustUseHoleCards: 2, hiLo: false },
};
