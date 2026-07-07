import { expect, test } from "vitest";

import { parseHand } from "./cards";
import { combinations, evaluateAndCompare, evaluateHighHand } from "./plo-evaluation";

test("combinations count is n choose k", () => {
  expect(combinations([1, 2, 3, 4, 5], 2).length).toBe(10);
  expect(combinations([1, 2, 3, 4, 5], 3).length).toBe(10);
});

test("high hand category ordering", () => {
  const straightFlush = evaluateHighHand(parseHand(["9d", "8d", "7d", "6d", "5d"]));
  const quads = evaluateHighHand(parseHand(["9d", "9c", "9h", "9s", "5d"]));
  const fullHouse = evaluateHighHand(parseHand(["9d", "9c", "9h", "5s", "5d"]));
  const flush = evaluateHighHand(parseHand(["Ad", "9d", "7d", "6d", "5d"]));
  const straight = evaluateHighHand(parseHand(["9d", "8c", "7d", "6d", "5d"]));
  const trips = evaluateHighHand(parseHand(["9d", "9c", "9h", "Ks", "5d"]));
  const twoPair = evaluateHighHand(parseHand(["9d", "9c", "5h", "5s", "Kd"]));
  const pair = evaluateHighHand(parseHand(["9d", "9c", "Kh", "7s", "5d"]));
  const highCard = evaluateHighHand(parseHand(["Ad", "9c", "7h", "5s", "3d"]));

  expect(straightFlush).toBeGreaterThan(quads);
  expect(quads).toBeGreaterThan(fullHouse);
  expect(fullHouse).toBeGreaterThan(flush);
  expect(flush).toBeGreaterThan(straight);
  expect(straight).toBeGreaterThan(trips);
  expect(trips).toBeGreaterThan(twoPair);
  expect(twoPair).toBeGreaterThan(pair);
  expect(pair).toBeGreaterThan(highCard);
});

// Regression: the old score bands overflowed, so a big full house outranked
// quads and a big two pair outranked trips.
test("category beats any hand of the category below", () => {
  const lowQuads = evaluateHighHand(parseHand(["2d", "2c", "2h", "2s", "3d"]));
  const bigFullHouse = evaluateHighHand(parseHand(["Ad", "Ac", "Ah", "Ks", "Kd"]));
  expect(lowQuads).toBeGreaterThan(bigFullHouse);

  const lowTrips = evaluateHighHand(parseHand(["2d", "2c", "2h", "4s", "3d"]));
  const bigTwoPair = evaluateHighHand(parseHand(["Ad", "Ac", "Kh", "Ks", "Qd"]));
  expect(lowTrips).toBeGreaterThan(bigTwoPair);
});

// Regression: the wheel used to score as an ace-high straight.
test("wheel is the lowest straight", () => {
  const wheel = evaluateHighHand(parseHand(["Ad", "5c", "4d", "3d", "2s"]));
  const sixHigh = evaluateHighHand(parseHand(["6d", "5c", "4d", "3d", "2s"]));
  const trips = evaluateHighHand(parseHand(["Ad", "Ac", "Ah", "Ks", "Qd"]));
  expect(sixHigh).toBeGreaterThan(wheel);
  expect(wheel).toBeGreaterThan(trips);

  const steelWheel = evaluateHighHand(parseHand(["Ad", "5d", "4d", "3d", "2d"]));
  const sixHighSF = evaluateHighHand(parseHand(["6d", "5d", "4d", "3d", "2d"]));
  const quadAces = evaluateHighHand(parseHand(["Ad", "Ac", "Ah", "As", "Kd"]));
  expect(sixHighSF).toBeGreaterThan(steelWheel);
  expect(steelWheel).toBeGreaterThan(quadAces);
});

// Regression: kickers used to be ignored, turning wins into splits.
test("kickers break ties within a category", () => {
  const pairAceKicker = evaluateHighHand(parseHand(["Kd", "Kc", "Ah", "7s", "5d"]));
  const pairQueenKicker = evaluateHighHand(parseHand(["Kh", "Ks", "Qh", "7c", "5c"]));
  expect(pairAceKicker).toBeGreaterThan(pairQueenKicker);

  const fullHouseKingsFull = evaluateHighHand(parseHand(["Kd", "Kc", "Kh", "2s", "2d"]));
  const fullHouseQueensFull = evaluateHighHand(parseHand(["Qd", "Qc", "Qh", "As", "Ad"]));
  expect(fullHouseKingsFull).toBeGreaterThan(fullHouseQueensFull);

  const highCardBetterLast = evaluateHighHand(parseHand(["Ad", "Kc", "Qh", "Js", "9d"]));
  const highCardWorseLast = evaluateHighHand(parseHand(["Ah", "Ks", "Qd", "Jc", "8c"]));
  expect(highCardBetterLast).toBeGreaterThan(highCardWorseLast);
});

test("identical hands in different suits are true ties", () => {
  const clubsAndDiamonds = evaluateHighHand(parseHand(["Kd", "Kc", "Ah", "7s", "5d"]));
  const heartsAndSpades = evaluateHighHand(parseHand(["Kh", "Ks", "Ad", "7c", "5c"]));
  expect(clubsAndDiamonds).toBe(heartsAndSpades);
});

test("evaluateAndCompare picks the high winner", () => {
  const heroCombos = [parseHand(["Ad", "Kd", "9d", "7d", "5d"])];
  const villainCombos = [parseHand(["Ac", "Ah", "9s", "7c", "5h"])];
  const result = evaluateAndCompare(heroCombos, villainCombos);
  expect(result.highWinner).toBe("Hero");
});
