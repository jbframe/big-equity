import { expect, test } from "vitest";

import { simulate } from "./engine";

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

// --- Big O (Hi-Lo) ---

const HERO = ["Ad", "5d", "4s", "Ks", "Tc"];
const VILLAIN = ["Ah", "Ac", "Kd", "4c", "2h"];

test("big-o: tallies sum to the simulation count", () => {
  const sims = 500;
  const r = simulate("big-o", HERO, VILLAIN, ["3s", "9d", "Js"], sims, seededRng(1));

  expect(r.simulations).toBe(sims);
  expect(r.high.heroWins + r.high.villainWins + r.high.splits).toBe(sims);
  expect(r.low.heroWins + r.low.villainWins + r.low.splits + r.low.noLow).toBe(sims);
  expect(r.scoop.hero + r.scoop.villain + r.scoop.none).toBe(sims);
  expect(r.heroEquity).toBeGreaterThanOrEqual(0);
  expect(r.heroEquity).toBeLessThanOrEqual(100);
});

test("big-o: same seed gives identical results", () => {
  const a = simulate("big-o", HERO, VILLAIN, ["3s", "9d", "Js"], 200, seededRng(42));
  const b = simulate("big-o", HERO, VILLAIN, ["3s", "9d", "Js"], 200, seededRng(42));
  expect(a).toEqual(b);
});

test("big-o: hero with an unbeatable high and no possible low scoops every runout", () => {
  // Full 5-card board: nothing left to deal, so the result is exact. Hero holds
  // the royal flush (As Ts + Ks Qs Js); only two board cards are 8-or-lower,
  // so no player can assemble five low cards and no low pot exists.
  const hero = ["As", "Ts", "3h", "4h", "5h"];
  const villain = ["Ah", "Ad", "9c", "9d", "8h"];
  const board = ["Ks", "Qs", "Js", "2d", "7c"];

  const r = simulate("big-o", hero, villain, board, 100);

  expect(r.heroEquity).toBe(100);
  expect(r.scoop.hero).toBe(100);
  expect(r.high.heroWins).toBe(100);
  expect(r.low.noLow).toBe(100);
});

test("big-o: equity converges near the reference value for the example matchup", () => {
  // simulationTS main.ts example: hero equity lands around 53%.
  const r = simulate("big-o", HERO, VILLAIN, ["3s", "9d", "Js"], 5000, seededRng(7));
  expect(r.heroEquity).toBeGreaterThan(48);
  expect(r.heroEquity).toBeLessThan(58);
});

// --- Hold'em ---

test("holdem: tallies sum to the simulation count", () => {
  const sims = 500;
  const r = simulate("holdem", ["As", "Ks"], ["Qd", "Qc"], [], sims, seededRng(1));

  expect(r.simulations).toBe(sims);
  expect(r.high.heroWins + r.high.villainWins + r.high.splits).toBe(sims);
  expect(r.heroEquity).toBeGreaterThanOrEqual(0);
  expect(r.heroEquity).toBeLessThanOrEqual(100);
});

test("holdem: same seed gives identical results", () => {
  const a = simulate("holdem", ["As", "Ks"], ["Qd", "Qc"], [], 200, seededRng(42));
  const b = simulate("holdem", ["As", "Ks"], ["Qd", "Qc"], [], 200, seededRng(42));
  expect(a).toEqual(b);
});

test("holdem: a locked full board is exact: kicker decides the pot", () => {
  // Both pair the ace; hero's king kicker outkicks villain's queen.
  const r = simulate(
    "holdem",
    ["As", "Kd"],
    ["Ah", "Qc"],
    ["Ac", "9d", "7c", "5s", "2h"],
    100,
  );

  expect(r.heroEquity).toBe(100);
  expect(r.high.heroWins).toBe(100);
});

test("holdem: aces vs kings preflop lands near the reference equity", () => {
  // Reference: AA is roughly an 81/19 favourite over KK preflop.
  const r = simulate("holdem", ["As", "Ad"], ["Ks", "Kd"], [], 5000, seededRng(7));
  expect(r.heroEquity).toBeGreaterThan(77);
  expect(r.heroEquity).toBeLessThan(86);
});

// --- PLO (high only) ---

// A full board makes every run deterministic: no cards are dealt.

// Regression: under the old overflowing score bands, Villain's jacks-full
// full house outranked Hero's quad deuces.
test("plo: quads beat a full house on a full board", () => {
  const result = simulate(
    "plo",
    ["2h", "2s", "Kc", "Kd"],
    ["Jc", "Jd", "Ac", "Ad"],
    ["2c", "2d", "Jh", "9c", "9d"],
    50,
  );
  expect(result.heroEquity).toBe(100);
  expect(result.high).toEqual({ heroWins: 50, villainWins: 0, splits: 0 });
});

// Regression: kickers used to be ignored, so this counted as a split.
test("plo: kicker decides between one-pair hands on a full board", () => {
  // Both make a pair of aces; Hero's queen kicker beats Villain's jack kicker.
  const result = simulate(
    "plo",
    ["Ac", "Qd", "7c", "6h"],
    ["Ah", "Jd", "7d", "6s"],
    ["As", "Td", "8c", "4h", "2s"],
    10,
  );
  expect(result.heroEquity).toBe(100);
});

test("plo: hero equity from a partial board stays in bounds and uses the given rng", () => {
  const rng = () => 0.42;
  const result = simulate(
    "plo",
    ["Ac", "Ad", "Kc", "Kd"],
    ["9h", "8h", "7s", "6s"],
    ["As", "Ks", "2d"],
    25,
    rng,
  );
  expect(result.simulations).toBe(25);
  expect(result.heroEquity).toBeGreaterThanOrEqual(0);
  expect(result.heroEquity).toBeLessThanOrEqual(100);
  const { heroWins, villainWins, splits } = result.high;
  expect(heroWins + villainWins + splits).toBe(25);
});
