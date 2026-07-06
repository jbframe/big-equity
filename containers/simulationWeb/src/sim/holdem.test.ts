import { expect, test } from "vitest";

import { scoreFiveCardHand, simulateHoldemBoard } from "./holdem";

/** Deterministic PRNG (mulberry32) so simulation runs are reproducible. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("scoring ranks the hand categories in order", () => {
  const ascending = [
    ["As", "Kd", "9c", "7h", "2s"], // high card
    ["As", "Ad", "9c", "7h", "2s"], // pair
    ["As", "Ad", "9c", "9h", "2s"], // two pair
    ["As", "Ad", "Ac", "7h", "2s"], // trips
    ["6s", "5d", "4c", "3h", "2s"], // straight
    ["As", "Ks", "9s", "7s", "2s"], // flush
    ["As", "Ad", "Ac", "7h", "7s"], // full house
    ["As", "Ad", "Ac", "Ah", "2s"], // quads
    ["6s", "5s", "4s", "3s", "2s"], // straight flush
  ];
  const scores = ascending.map(scoreFiveCardHand);
  for (let i = 1; i < scores.length; i++) {
    expect(scores[i]!).toBeGreaterThan(scores[i - 1]!);
  }
});

test("scoring resolves kickers", () => {
  // Pair of aces, king kicker beats pair of aces, queen kicker.
  const kingKicker = scoreFiveCardHand(["As", "Ad", "Kc", "7h", "2s"]);
  const queenKicker = scoreFiveCardHand(["As", "Ad", "Qc", "7h", "2s"]);
  expect(kingKicker).toBeGreaterThan(queenKicker);

  // The wheel is the lowest straight.
  const wheel = scoreFiveCardHand(["As", "2d", "3c", "4h", "5s"]);
  const sixHigh = scoreFiveCardHand(["2d", "3c", "4h", "5s", "6d"]);
  expect(sixHigh).toBeGreaterThan(wheel);

  // Identical ranks in different suits are a true tie.
  const spades = scoreFiveCardHand(["As", "Kd", "9c", "7h", "2s"]);
  const hearts = scoreFiveCardHand(["Ah", "Kc", "9d", "7s", "2h"]);
  expect(spades).toBe(hearts);
});

test("tallies sum to the simulation count", () => {
  const sims = 500;
  const r = simulateHoldemBoard(["As", "Ks"], ["Qd", "Qc"], [], sims, seededRng(1));

  expect(r.simulations).toBe(sims);
  expect(r.heroWins + r.villainWins + r.ties).toBe(sims);
  expect(r.heroEquity).toBeGreaterThanOrEqual(0);
  expect(r.heroEquity).toBeLessThanOrEqual(100);
});

test("same seed gives identical results", () => {
  const a = simulateHoldemBoard(["As", "Ks"], ["Qd", "Qc"], [], 200, seededRng(42));
  const b = simulateHoldemBoard(["As", "Ks"], ["Qd", "Qc"], [], 200, seededRng(42));
  expect(a).toEqual(b);
});

test("a locked full board is exact: kicker decides the pot", () => {
  // Both pair the ace; hero's king kicker outkicks villain's queen.
  const r = simulateHoldemBoard(["As", "Kd"], ["Ah", "Qc"], ["Ac", "9d", "7c", "5s", "2h"], 100);

  expect(r.heroEquity).toBe(100);
  expect(r.heroWins).toBe(100);
});

test("aces vs kings preflop lands near the reference equity", () => {
  // Reference: AA is roughly an 81/19 favourite over KK preflop.
  const r = simulateHoldemBoard(["As", "Ad"], ["Ks", "Kd"], [], 5000, seededRng(7));
  expect(r.heroEquity).toBeGreaterThan(77);
  expect(r.heroEquity).toBeLessThan(86);
});
