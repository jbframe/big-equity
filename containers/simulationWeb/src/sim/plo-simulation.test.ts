import { expect, test } from "vitest";

import { simulatePLOBoard } from "./plo-simulation";

// A full board makes every run deterministic: no cards are dealt.

// Regression: under the old overflowing score bands, Villain's jacks-full
// full house outranked Hero's quad deuces.
test("quads beat a full house on a full board", () => {
  const result = simulatePLOBoard(
    ["2h", "2s", "Kc", "Kd", "Qh"],
    ["Jc", "Jd", "Ac", "Ad", "3h"],
    ["2c", "2d", "Jh", "9c", "9d"],
    50,
  );
  expect(result.heroEquity).toBe(100);
  expect(result.high).toEqual({ heroWins: 50, villainWins: 0, splits: 0 });
});

// Regression: kickers used to be ignored, so this counted as a split.
test("kicker decides between one-pair hands on a full board", () => {
  // Both make a pair of aces; Hero's queen kicker beats Villain's jack kicker.
  const result = simulatePLOBoard(
    ["Ac", "Qd", "7c", "6h", "3s"],
    ["Ah", "Jd", "7d", "6s", "3c"],
    ["As", "Td", "8c", "4h", "2s"],
    10,
  );
  expect(result.heroEquity).toBe(100);
});

test("hero equity from a partial board stays in bounds and uses the given rng", () => {
  const rng = () => 0.42;
  const result = simulatePLOBoard(
    ["Ac", "Ad", "Kc", "Kd", "Qh"],
    ["9h", "8h", "7s", "6s", "2c"],
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
