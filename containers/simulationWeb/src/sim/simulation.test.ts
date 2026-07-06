import { expect, test } from "vitest";

import { simulateBoard } from "./simulation";

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

const HERO = ["Ad", "5d", "4s", "Ks", "Tc"];
const VILLAIN = ["Ah", "Ac", "Kd", "4c", "2h"];

test("tallies sum to the simulation count", () => {
  const sims = 500;
  const r = simulateBoard(HERO, VILLAIN, ["3s", "9d", "Js"], sims, seededRng(1));

  expect(r.simulations).toBe(sims);
  expect(r.high.heroWins + r.high.villainWins + r.high.splits).toBe(sims);
  expect(r.low.heroWins + r.low.villainWins + r.low.splits + r.low.noLow).toBe(sims);
  expect(r.scoop.hero + r.scoop.villain + r.scoop.none).toBe(sims);
  expect(r.heroEquity).toBeGreaterThanOrEqual(0);
  expect(r.heroEquity).toBeLessThanOrEqual(100);
});

test("same seed gives identical results", () => {
  const a = simulateBoard(HERO, VILLAIN, ["3s", "9d", "Js"], 200, seededRng(42));
  const b = simulateBoard(HERO, VILLAIN, ["3s", "9d", "Js"], 200, seededRng(42));
  expect(a).toEqual(b);
});

test("hero with an unbeatable high and no possible low scoops every runout", () => {
  // Full 5-card board: nothing left to deal, so the result is exact. Hero holds
  // the royal flush (As Ts + Ks Qs Js); only two board cards are 8-or-lower,
  // so no player can assemble five low cards and no low pot exists.
  const hero = ["As", "Ts", "3h", "4h", "5h"];
  const villain = ["Ah", "Ad", "9c", "9d", "8h"];
  const board = ["Ks", "Qs", "Js", "2d", "7c"];

  const r = simulateBoard(hero, villain, board, 100);

  expect(r.heroEquity).toBe(100);
  expect(r.scoop.hero).toBe(100);
  expect(r.high.heroWins).toBe(100);
  expect(r.low.noLow).toBe(100);
});

test("equity converges near the reference value for the example matchup", () => {
  // simulationTS main.ts example: hero equity lands around 53%.
  const r = simulateBoard(HERO, VILLAIN, ["3s", "9d", "Js"], 5000, seededRng(7));
  expect(r.heroEquity).toBeGreaterThan(48);
  expect(r.heroEquity).toBeLessThan(58);
});
