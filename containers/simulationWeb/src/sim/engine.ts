/**
 * Monte Carlo equity engine for a heads-up poker matchup, shared by every
 * game variant.
 *
 * Given two hands and a partial board, the engine repeatedly deals out the
 * remaining board cards at random, scores each player's best 5-card hand
 * under the game's showdown rules (see `games.ts`), and tallies outcomes
 * into Hero's total pot equity. Hi-Lo games additionally contest an
 * 8-or-better low pot and track scoops.
 */

import type { GameType } from "../gameType";
import type { Card } from "./cards";
import { combinations, parseHand, remainingDeck, shuffle } from "./cards";
import type { HighWinner, LowWinner } from "./evaluation";
import { evaluateLowHand, scoreFiveCardHand } from "./evaluation";
import type { GameRules } from "./games";
import { GAME_RULES } from "./games";

export interface Tally {
  heroWins: number;
  villainWins: number;
  splits: number;
}

export interface LowTally extends Tally {
  noLow: number;
}

export interface HighOnlyResult {
  simulations: number;
  heroEquity: number;
  high: Tally;
}

export interface HiLoResult extends HighOnlyResult {
  low: LowTally;
  scoop: { hero: number; villain: number; none: number };
  /** Breakdown of the high/low pots in runouts where neither player scooped. */
  noScoop: { high: Tally; low: LowTally };
}

export type SimResult = HighOnlyResult | HiLoResult;

/** Every legal 5-card showdown hand under the game's hole-card rule. */
function candidateHands(
  hole: readonly Card[],
  board: readonly Card[],
  rules: GameRules,
): Card[][] {
  if (rules.mustUseHoleCards === 2) {
    const hands: Card[][] = [];
    for (const holeCards of combinations(hole, 2)) {
      for (const boardCards of combinations(board, 3)) {
        hands.push([...holeCards, ...boardCards]);
      }
    }
    return hands;
  }
  return combinations([...hole, ...board], 5);
}

/** A player's best high score and (for Hi-Lo games) best qualifying low. */
function bestScores(
  hole: readonly Card[],
  board: readonly Card[],
  rules: GameRules,
): { high: number; low: number } {
  let high = -1;
  let low = Infinity;
  for (const combo of candidateHands(hole, board, rules)) {
    const h = scoreFiveCardHand(combo);
    if (h > high) high = h;
    if (rules.hiLo) {
      const l = evaluateLowHand(combo);
      if (l !== null && l < low) low = l;
    }
  }
  return { high, low };
}

export function simulate(
  gameType: "big-o",
  heroHandRaw: readonly string[],
  villainHandRaw: readonly string[],
  boardRaw: readonly string[],
  simulations?: number,
  rng?: () => number,
): HiLoResult;
export function simulate(
  gameType: "holdem" | "plo",
  heroHandRaw: readonly string[],
  villainHandRaw: readonly string[],
  boardRaw: readonly string[],
  simulations?: number,
  rng?: () => number,
): HighOnlyResult;
export function simulate(
  gameType: GameType,
  heroHandRaw: readonly string[],
  villainHandRaw: readonly string[],
  boardRaw: readonly string[],
  simulations?: number,
  rng?: () => number,
): SimResult;
export function simulate(
  gameType: GameType,
  heroHandRaw: readonly string[],
  villainHandRaw: readonly string[],
  boardRaw: readonly string[],
  simulations = 10_000,
  rng: () => number = Math.random,
): SimResult {
  const rules = GAME_RULES[gameType];
  const heroHand = parseHand(heroHandRaw);
  const villainHand = parseHand(villainHandRaw);
  const board = parseHand(boardRaw);

  const high: Tally = { heroWins: 0, villainWins: 0, splits: 0 };
  const low: LowTally = { heroWins: 0, villainWins: 0, splits: 0, noLow: 0 };
  const scoop = { hero: 0, villain: 0, none: 0 };
  const nsHigh: Tally = { heroWins: 0, villainWins: 0, splits: 0 };
  const nsLow: LowTally = { heroWins: 0, villainWins: 0, splits: 0, noLow: 0 };

  const deck = remainingDeck(heroHand, villainHand, board);
  const cardsToDeal = 5 - board.length;

  for (let s = 0; s < simulations; s++) {
    shuffle(deck, rng);
    const completeBoard = [...board, ...deck.slice(0, cardsToDeal)];

    const hero = bestScores(heroHand, completeBoard, rules);
    const villain = bestScores(villainHand, completeBoard, rules);

    const highWinner: HighWinner =
      hero.high > villain.high ? "Hero" : hero.high === villain.high ? "Split" : "Villain";

    if (highWinner === "Hero") high.heroWins++;
    else if (highWinner === "Villain") high.villainWins++;
    else high.splits++;

    if (!rules.hiLo) continue;

    let lowWinner: LowWinner = null;
    if (hero.low < Infinity || villain.low < Infinity) {
      if (hero.low < villain.low) lowWinner = "Hero";
      else if (hero.low === villain.low) lowWinner = "Split";
      else lowWinner = "Villain";
    }

    if (lowWinner === "Hero") low.heroWins++;
    else if (lowWinner === "Villain") low.villainWins++;
    else if (lowWinner === null) low.noLow++;
    else low.splits++;

    const heroScoops = highWinner === "Hero" && (lowWinner === "Hero" || lowWinner === null);
    const villainScoops =
      highWinner === "Villain" && (lowWinner === "Villain" || lowWinner === null);

    if (heroScoops) {
      scoop.hero++;
    } else if (villainScoops) {
      scoop.villain++;
    } else {
      scoop.none++;

      if (highWinner === "Hero") nsHigh.heroWins++;
      else if (highWinner === "Villain") nsHigh.villainWins++;
      else nsHigh.splits++;

      if (lowWinner === "Hero") nsLow.heroWins++;
      else if (lowWinner === "Villain") nsLow.villainWins++;
      else if (lowWinner === null) nsLow.noLow++;
      else nsLow.splits++;
    }
  }

  if (!rules.hiLo) {
    const heroEquity = ((high.heroWins + 0.5 * high.splits) / simulations) * 100;
    return { simulations, heroEquity, high };
  }

  // Hero's pot equity: scoops win the whole pot; split runouts award half the
  // high pot and half the low pot, with split high/low counting as a quarter.
  // A no-scoop runout with no qualifying low is always a high split (a sole
  // high winner would have scooped), and with no low pot the high pot is the
  // whole pot: half each, so a quarter on top of the high-split quarter.
  const noScoopShare =
    scoop.none === 0
      ? 0
      : (0.5 * nsHigh.heroWins +
          0.25 * nsHigh.splits +
          0.5 * nsLow.heroWins +
          0.25 * nsLow.splits +
          0.25 * nsLow.noLow) /
        simulations;

  const heroEquity = (scoop.hero / simulations + noScoopShare) * 100;

  return {
    simulations,
    heroEquity,
    high,
    low,
    scoop,
    noScoop: { high: nsHigh, low: nsLow },
  };
}
