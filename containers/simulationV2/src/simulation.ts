/**
 * Monte Carlo equity simulation for a single Big O Hi-Lo matchup.
 *
 * Given two 5-card hands and a partial board, the simulator repeatedly deals
 * out the remaining board cards at random and tallies high/low/scoop outcomes,
 * then derives Hero's total pot equity.
 */

import type { Card } from "./cards.js";
import { parseHand, remainingDeck, shuffle } from "./cards.js";
import { combinations, evaluateAndCompare } from "./evaluation.js";

export interface SimulationResult {
  simulations: number;
  heroEquity: number;
  high: { heroWins: number; villainWins: number; splits: number };
  low: { heroWins: number; villainWins: number; splits: number; noLow: number };
  scoop: { hero: number; villain: number; none: number };
  /** Breakdown of the high/low pots in runouts where neither player scooped. */
  noScoop: {
    high: { heroWins: number; villainWins: number; splits: number };
    low: { heroWins: number; villainWins: number; splits: number; noLow: number };
  };
}

/**
 * Build every legal 5-card showdown hand: exactly 2 hole cards + 3 board cards.
 */
function generateHands(hand: readonly Card[], board: readonly Card[]): Card[][] {
  const hands: Card[][] = [];
  for (const hole of combinations(hand, 2)) {
    for (const boardCards of combinations(board, 3)) {
      hands.push([...hole, ...boardCards]);
    }
  }
  return hands;
}

export function simulateBoard(
  heroHandRaw: readonly string[],
  villainHandRaw: readonly string[],
  boardRaw: readonly string[],
  simulations = 10_000,
  rng: () => number = Math.random,
): SimulationResult {
  const heroHand = parseHand(heroHandRaw);
  const villainHand = parseHand(villainHandRaw);
  const board = parseHand(boardRaw);

  const high = { heroWins: 0, villainWins: 0, splits: 0 };
  const low = { heroWins: 0, villainWins: 0, splits: 0, noLow: 0 };
  const scoop = { hero: 0, villain: 0, none: 0 };
  const nsHigh = { heroWins: 0, villainWins: 0, splits: 0 };
  const nsLow = { heroWins: 0, villainWins: 0, splits: 0, noLow: 0 };

  const deck = remainingDeck(heroHand, villainHand, board);
  const cardsToDeal = 5 - board.length;

  for (let s = 0; s < simulations; s++) {
    shuffle(deck, rng);
    const completeBoard = [...board, ...deck.slice(0, cardsToDeal)];

    const heroCombos = generateHands(heroHand, completeBoard);
    const villainCombos = generateHands(villainHand, completeBoard);
    const { highWinner, lowWinner } = evaluateAndCompare(heroCombos, villainCombos);

    if (highWinner === "Hero") high.heroWins++;
    else if (highWinner === "Villain") high.villainWins++;
    else high.splits++;

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

  // Hero's pot equity: scoops win the whole pot; split runouts award half the
  // high pot and half the low pot, with split high/low counting as a quarter.
  const noScoopShare =
    scoop.none === 0
      ? 0
      : (scoop.none / simulations) *
        ((0.5 * nsHigh.heroWins) / scoop.none +
          (0.25 * nsHigh.splits) / scoop.none +
          (0.5 * nsLow.heroWins) / scoop.none +
          (0.25 * nsLow.splits) / scoop.none);

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

const pct = (n: number, total: number): string =>
  total === 0 ? "0.00" : ((n / total) * 100).toFixed(2);

/** Print a simulation result in the same layout as the original script. */
export function printResult(result: SimulationResult): void {
  const { simulations: sims, high, low, scoop, noScoop } = result;
  const none = scoop.none;

  console.log(`simulations: ${sims}`);
  console.log(`\n\nTotal Hero Equity: ${result.heroEquity.toFixed(3)}%`);
  console.log(
    `High hand - Hero wins: ${pct(high.heroWins, sims)}%, ` +
      `Villain wins: ${pct(high.villainWins, sims)}%, ` +
      `Splits: ${pct(high.splits, sims)}%`,
  );
  console.log(
    `Low hand - No Low: ${pct(low.noLow, sims)}%, ` +
      `Hero wins: ${pct(low.heroWins, sims)}%, ` +
      `Villain wins: ${pct(low.villainWins, sims)}%, ` +
      `Splits: ${pct(low.splits, sims)}%`,
  );
  console.log("\n");
  console.log(
    `Scoop:\nHero Scoops: ${pct(scoop.hero, sims)}%, ` +
      `Villain Scoops: ${pct(scoop.villain, sims)}%, ` +
      `No Scoop: ${pct(none, sims)}%`,
  );

  console.log("\nNo Scoop:");
  console.log(
    `High hand - Hero wins: ${pct(noScoop.high.heroWins, none)}%, ` +
      `Villain wins: ${pct(noScoop.high.villainWins, none)}%, ` +
      `Splits: ${pct(noScoop.high.splits, none)}%`,
  );
  console.log(
    `Low hand - Hero wins: ${pct(noScoop.low.heroWins, none)}%, ` +
      `Villain wins: ${pct(noScoop.low.villainWins, none)}%, ` +
      `Splits: ${pct(noScoop.low.splits, none)}%, ` +
      `No Low: ${pct(noScoop.low.noLow, none)}%`,
  );
  console.log("\n");
}
