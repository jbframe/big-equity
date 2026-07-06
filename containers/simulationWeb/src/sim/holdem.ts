/**
 * Monte Carlo equity simulation for a heads-up No Limit Hold'em matchup.
 *
 * Given two 2-card hands and a partial board, the simulator repeatedly deals
 * out the remaining board cards at random, scores each player's best 5-card
 * hand out of their 7 available cards, and tallies wins/ties into Hero's
 * pot equity.
 *
 * Unlike the Hi-Lo evaluator (which mirrors the original Python scoring and
 * ignores kickers), Hold'em has a single high pot where kickers routinely
 * decide showdowns, so this module scores hands with full kicker resolution.
 */

import type { Card } from "./cards";
import { parseHand, remainingDeck, shuffle } from "./cards";
import { HIGH_RANK, combinations } from "./evaluation";

export interface HoldemSimulationResult {
  simulations: number;
  heroEquity: number;
  heroWins: number;
  villainWins: number;
  ties: number;
}

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

/** Best 5-card score out of 2 hole cards plus the full board. */
function bestOfSeven(hole: readonly Card[], board: readonly Card[]): number {
  let best = -1;
  for (const combo of combinations([...hole, ...board], 5)) {
    const score = scoreFiveCardHand(combo);
    if (score > best) best = score;
  }
  return best;
}

export function simulateHoldemBoard(
  heroHandRaw: readonly string[],
  villainHandRaw: readonly string[],
  boardRaw: readonly string[],
  simulations = 10_000,
  rng: () => number = Math.random,
): HoldemSimulationResult {
  const heroHand = parseHand(heroHandRaw);
  const villainHand = parseHand(villainHandRaw);
  const board = parseHand(boardRaw);

  let heroWins = 0;
  let villainWins = 0;
  let ties = 0;

  const deck = remainingDeck(heroHand, villainHand, board);
  const cardsToDeal = 5 - board.length;

  for (let s = 0; s < simulations; s++) {
    shuffle(deck, rng);
    const completeBoard = [...board, ...deck.slice(0, cardsToDeal)];

    const hero = bestOfSeven(heroHand, completeBoard);
    const villain = bestOfSeven(villainHand, completeBoard);

    if (hero > villain) heroWins++;
    else if (villain > hero) villainWins++;
    else ties++;
  }

  const heroEquity = ((heroWins + ties / 2) / simulations) * 100;

  return { simulations, heroEquity, heroWins, villainWins, ties };
}
