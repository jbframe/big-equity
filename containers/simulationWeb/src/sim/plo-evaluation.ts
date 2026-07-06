/**
 * Five-card hand evaluation for poker Hi-Lo.
 *
 * The scoring scheme is intentionally identical to the original Python
 * implementation so results match: a single integer score per hand where
 * higher is better for the high hand, and lower is better for the (8-or-better)
 * low hand. Cards are expected in canonical form (see `cards.ts`).
 */

import type { Card } from "./cards";

export type Player = "Hero" | "Villain";
export type HighWinner = Player | "Split";

export const HIGH_RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
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

export interface CompareResult {
  highWinner: HighWinner;
  bestHeroHigh: number;
  bestVillainHigh: number;
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
    for (const combo of combos) {
      const h = evaluateHighHand(combo);
      if (h > high) high = h;
    }
    return { high };
  };

  const hero = best(heroCombos);
  const villain = best(villainCombos);

  const highWinner: HighWinner =
    hero.high > villain.high ? "Hero" : hero.high === villain.high ? "Split" : "Villain";

  return {
    highWinner,
    bestHeroHigh: hero.high,
    bestVillainHigh: villain.high,
  };
}
