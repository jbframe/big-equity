/**
 * Five-card hand evaluation, shared by every game variant.
 *
 * High hands are scored with full kicker resolution: a category digit packed
 * above five base-15 tiebreaker digits, so higher is strictly better and
 * equal scores are true ties. Low hands use the 8-or-better rule where lower
 * is better. Cards are expected in canonical form (see `cards.ts`).
 */

import type { Card } from "./cards";

export type Player = "Hero" | "Villain";
export type HighWinner = Player | "Split";
export type LowWinner = Player | "Split" | null;

export const HIGH_RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const LOW_RANK: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
};

// Hand categories, packed above five base-15 tiebreaker digits.
const STRAIGHT_FLUSH = 8;
const QUADS = 7;
const FULL_HOUSE = 6;
const FLUSH = 5;
const STRAIGHT = 4;
const TRIPS = 3;
const TWO_PAIR = 2;
const PAIR = 1;

/**
 * Score a 5-card high hand with full kicker resolution. Higher is better;
 * equal scores are true ties.
 */
export function scoreFiveCardHand(hand: readonly Card[]): number {
  const ranks = hand.map((card) => HIGH_RANK[card[0]!]!).sort((a, b) => b - a);
  const isFlush = hand.every((card) => card[1] === hand[0]![1]);

  const rankCounts = new Map<number, number>();
  for (const rank of ranks) rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);

  // Groups ordered by count desc then rank desc put the deciding ranks first
  // (e.g. trips rank before kickers), so they double as the tiebreaker list.
  const groups = [...rankCounts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  let straightHigh = 0;
  if (groups.length === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    // Ace plays low in the wheel: ranks desc are A 5 4 3 2.
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) straightHigh = 5;
  }

  let category: number;
  let tiebreaks: number[];
  if (straightHigh) {
    category = isFlush ? STRAIGHT_FLUSH : STRAIGHT;
    tiebreaks = [straightHigh];
  } else if (isFlush) {
    category = FLUSH;
    tiebreaks = ranks;
  } else if (groups[0]!.count === 4) {
    category = QUADS;
    tiebreaks = groups.map((g) => g.rank);
  } else if (groups[0]!.count === 3 && groups[1]!.count === 2) {
    category = FULL_HOUSE;
    tiebreaks = groups.map((g) => g.rank);
  } else if (groups[0]!.count === 3) {
    category = TRIPS;
    tiebreaks = groups.map((g) => g.rank);
  } else if (groups[0]!.count === 2 && groups[1]!.count === 2) {
    category = TWO_PAIR;
    tiebreaks = groups.map((g) => g.rank);
  } else if (groups[0]!.count === 2) {
    category = PAIR;
    tiebreaks = groups.map((g) => g.rank);
  } else {
    category = 0;
    tiebreaks = ranks;
  }

  let score = category;
  for (let i = 0; i < 5; i++) score = score * 15 + (tiebreaks[i] ?? 0);
  return score;
}

/**
 * Score a 5-card low hand (8-or-better). Returns `null` when the hand does not
 * qualify (fewer than five distinct cards ranked 8 or lower). Lower is better.
 */
export function evaluateLowHand(hand: readonly Card[]): number | null {
  const lowRanks: number[] = [];
  for (const card of hand) {
    const value = LOW_RANK[card[0]!];
    if (value !== undefined && value <= 8) {
      lowRanks.push(value);
    }
  }

  if (lowRanks.length < 5) return null;

  const uniqueLow = [...new Set(lowRanks)].sort((a, b) => a - b);
  if (uniqueLow.length < 5) return null;

  // Positional weighting: highest card dominates the score, so a lower high
  // card yields a lower (better) score.
  let score = 0;
  let multiplier = 1;
  for (const rank of uniqueLow) {
    score += rank * multiplier;
    multiplier *= 10;
  }
  return score;
}
