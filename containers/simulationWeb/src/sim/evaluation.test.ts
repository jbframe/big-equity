// Ported from simulationTS `src/evaluation.test.ts` — keep the two suites in
// sync so the copied engine is verifiably the same.

import { expect, test } from "vitest";

import { parseCard, parseHand, remainingDeck } from "./cards";
import {
  combinations,
  evaluateAndCompare,
  evaluateHighHand,
  evaluateLowHand,
} from "./evaluation";

test("parseCard normalizes ten and casing", () => {
  expect(parseCard("10c")).toBe("Tc");
  expect(parseCard("Tc")).toBe("Tc");
  expect(parseCard("AD")).toBe("Ad");
  expect(parseCard(" ks ")).toBe("Ks");
});

test("remainingDeck excludes 10x and Tx as the same card", () => {
  const deck = remainingDeck(parseHand(["10c"]));
  expect(deck.length).toBe(51);
  expect(deck.includes("Tc")).toBe(false);
});

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

test("wheel straight is detected", () => {
  const wheel = evaluateHighHand(parseHand(["Ad", "5c", "4d", "3d", "2s"]));
  expect(wheel).toBeGreaterThanOrEqual(4000);
  expect(wheel).toBeLessThan(5000);
});

test("low hand requires five distinct cards 8-or-lower", () => {
  expect(evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "5h"]))).not.toBeNull();
  expect(evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "9h"]))).toBeNull();
  expect(evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "4h"]))).toBeNull();
});

test("lower low hand beats higher low hand", () => {
  const wheel = evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "5h"]))!;
  const eightLow = evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "8h"]))!;
  expect(wheel).toBeLessThan(eightLow);
});

test("evaluateAndCompare picks high and low winners", () => {
  // Hero makes a flush combo; Villain top hand is a pair.
  const heroCombos = [parseHand(["Ad", "Kd", "9d", "7d", "5d"])];
  const villainCombos = [parseHand(["Ac", "Ah", "9d", "7d", "5d"])];
  const result = evaluateAndCompare(heroCombos, villainCombos);
  expect(result.highWinner).toBe("Hero");
});
