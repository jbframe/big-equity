/**
 * Monte Carlo equity simulation for a single poker Hi-Lo matchup.
 *
 * Given two 5-card hands and a partial board, the simulator repeatedly deals
 * out the remaining board cards at random and tallies high/low/scoop outcomes,
 * then derives Hero's total pot equity.
 */

import type { Card } from "./cards";
import { parseHand, remainingDeck, shuffle } from "./cards";
import { combinations, evaluateAndCompare } from "./plo-evaluation";

export interface SimulationResult {
  simulations: number;
  heroEquity: number;
  high: { heroWins: number; villainWins: number; splits: number };
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

  const deck = remainingDeck(heroHand, villainHand, board);
  const cardsToDeal = 5 - board.length;

  for (let s = 0; s < simulations; s++) {
    shuffle(deck, rng);
    const completeBoard = [...board, ...deck.slice(0, cardsToDeal)];

    const heroCombos = generateHands(heroHand, completeBoard);
    const villainCombos = generateHands(villainHand, completeBoard);
    const { highWinner } = evaluateAndCompare(heroCombos, villainCombos);

    if (highWinner === "Hero") high.heroWins++;
    else if (highWinner === "Villain") high.villainWins++;
    else high.splits++;
  }

  return {
    simulations,
    heroEquity,
    high,
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
