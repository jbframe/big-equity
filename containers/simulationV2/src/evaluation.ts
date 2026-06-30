/**
 * Five-card hand evaluation for Big O Hi-Lo.
 *
 * The scoring scheme is intentionally identical to the original Python
 * implementation so results match: a single integer score per hand where
 * higher is better for the high hand, and lower is better for the (8-or-better)
 * low hand. Cards are expected in canonical form (see `cards.ts`).
 */

import type { Card } from "./cards.js";

export type Player = "Hero" | "Villain";
export type HighWinner = Player | "Split";
export type LowWinner = Player | "Split" | null;

const HIGH_RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const LOW_RANK: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
};

/** All k-combinations of `items` (order preserved). */
export function combinations<T>(items: readonly T[], k: number): T[][] {
  const result: T[][] = [];
  const combo: T[] = [];

  const recurse = (start: number): void => {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i <= items.length - (k - combo.length); i++) {
      combo.push(items[i]!);
      recurse(i + 1);
      combo.pop();
    }
  };

  recurse(0);
  return result;
}

/**
 * Score a 5-card high hand. Higher is better. Categories are separated by
 * powers of ten (straight flush 8000+, quads 7000+, ... high card <1000).
 */
export function evaluateHighHand(hand: readonly Card[]): number {
  const parsed = hand
    .map((card) => ({ rank: HIGH_RANK[card[0]!]!, suit: card[1]! }))
    .sort((a, b) => b.rank - a.rank);

  const rankCounts = new Map<number, number>();
  const suitCounts = new Map<string, number>();
  for (const { rank, suit } of parsed) {
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
    suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
  }

  const isFlush = [...suitCounts.values()].some((count) => count >= 5);

  const distinctRanksDesc = [...rankCounts.keys()].sort((a, b) => b - a);
  let isStraight = false;
  for (let i = 0; i < distinctRanksDesc.length - 4; i++) {
    if (distinctRanksDesc[i]! - distinctRanksDesc[i + 4]! === 4) {
      isStraight = true;
      break;
    }
  }
  // Ace plays low in a 5-high straight (wheel).
  const rankSet = new Set(distinctRanksDesc);
  if (!isStraight && [14, 5, 4, 3, 2].every((r) => rankSet.has(r))) {
    isStraight = true;
  }

  // (count, rank) pairs sorted by count desc, then rank desc.
  const mostCommon = [...rankCounts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const topRank = distinctRanksDesc[0]!;
  const first = mostCommon[0]!;
  const second = mostCommon[1];

  if (isFlush && isStraight) return 8000 + topRank;
  if (first.count === 4) return 7000 + first.rank;
  if (first.count === 3 && second && second.count >= 2) {
    return 6000 + first.rank * 100 + second.rank;
  }
  if (isFlush) return 5000 + topRank;
  if (isStraight) return 4000 + topRank;
  if (first.count === 3) return 3000 + first.rank;
  if (first.count === 2 && second && second.count === 2) {
    return 2000 + first.rank * 100 + second.rank;
  }
  if (first.count === 2) return 1000 + first.rank;
  return topRank;
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

export interface CompareResult {
  highWinner: HighWinner;
  lowWinner: LowWinner;
  bestHeroHigh: number;
  bestVillainHigh: number;
  bestHeroLow: number;
  bestVillainLow: number;
}

/**
 * Compare every candidate 5-card combo for each player, picking each player's
 * best high and best (qualifying) low, then determine the high and low winners.
 */
export function evaluateAndCompare(
  heroCombos: readonly Card[][],
  villainCombos: readonly Card[][],
): CompareResult {
  const best = (combos: readonly Card[][]) => {
    let high = -1;
    let low = Infinity;
    for (const combo of combos) {
      const h = evaluateHighHand(combo);
      if (h > high) high = h;
      const l = evaluateLowHand(combo);
      if (l !== null && l < low) low = l;
    }
    return { high, low };
  };

  const hero = best(heroCombos);
  const villain = best(villainCombos);

  const highWinner: HighWinner =
    hero.high > villain.high ? "Hero" : hero.high === villain.high ? "Split" : "Villain";

  let lowWinner: LowWinner = null;
  if (hero.low < Infinity || villain.low < Infinity) {
    if (hero.low < villain.low) lowWinner = "Hero";
    else if (hero.low === villain.low) lowWinner = "Split";
    else lowWinner = "Villain";
  }

  return {
    highWinner,
    lowWinner,
    bestHeroHigh: hero.high,
    bestVillainHigh: villain.high,
    bestHeroLow: hero.low,
    bestVillainLow: villain.low,
  };
}
