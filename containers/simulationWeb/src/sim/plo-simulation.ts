/**
 * Monte Carlo equity simulation for a single poker Hi matchup.
 *
 * Given two 5-card hands and a partial board, the simulator repeatedly deals
 * out the remaining board cards at random and tallies win/split outcomes,
 * then derives Hero's total pot equity.
 */

import type { Card } from "./cards";
import { parseHand, remainingDeck, shuffle } from "./cards";
import { combinations, evaluateAndCompare } from "./plo-evaluation";

export interface PLOSimulationResult {
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

export function simulatePLOBoard(
  heroHandRaw: readonly string[],
  villainHandRaw: readonly string[],
  boardRaw: readonly string[],
  simulations = 10_000,
  rng: () => number = Math.random,
): PLOSimulationResult {
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

  const heroEquity = ((high.heroWins + 0.5 * high.splits) / simulations) * 100;

  return {
    simulations,
    heroEquity,
    high,
  };
}
