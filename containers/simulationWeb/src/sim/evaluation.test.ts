import { expect, test } from "vitest";

import { combinations, parseCard, parseHand, remainingDeck } from "./cards";
import { evaluateLowHand, scoreFiveCardHand } from "./evaluation";

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

test("category beats any hand of the category below", () => {
  const lowQuads = scoreFiveCardHand(parseHand(["2d", "2c", "2h", "2s", "3d"]));
  const bigFullHouse = scoreFiveCardHand(parseHand(["Ad", "Ac", "Ah", "Ks", "Kd"]));
  expect(lowQuads).toBeGreaterThan(bigFullHouse);

  const lowTrips = scoreFiveCardHand(parseHand(["2d", "2c", "2h", "4s", "3d"]));
  const bigTwoPair = scoreFiveCardHand(parseHand(["Ad", "Ac", "Kh", "Ks", "Qd"]));
  expect(lowTrips).toBeGreaterThan(bigTwoPair);
});

test("wheel is the lowest straight", () => {
  const wheel = scoreFiveCardHand(parseHand(["Ad", "5c", "4d", "3d", "2s"]));
  const sixHigh = scoreFiveCardHand(parseHand(["6d", "5c", "4d", "3d", "2s"]));
  const trips = scoreFiveCardHand(parseHand(["Ad", "Ac", "Ah", "Ks", "Qd"]));
  expect(sixHigh).toBeGreaterThan(wheel);
  expect(wheel).toBeGreaterThan(trips);

  const steelWheel = scoreFiveCardHand(parseHand(["Ad", "5d", "4d", "3d", "2d"]));
  const sixHighSF = scoreFiveCardHand(parseHand(["6d", "5d", "4d", "3d", "2d"]));
  const quadAces = scoreFiveCardHand(parseHand(["Ad", "Ac", "Ah", "As", "Kd"]));
  expect(sixHighSF).toBeGreaterThan(steelWheel);
  expect(steelWheel).toBeGreaterThan(quadAces);
});

test("kickers break ties within a category", () => {
  const pairAceKicker = scoreFiveCardHand(parseHand(["Kd", "Kc", "Ah", "7s", "5d"]));
  const pairQueenKicker = scoreFiveCardHand(parseHand(["Kh", "Ks", "Qh", "7c", "5c"]));
  expect(pairAceKicker).toBeGreaterThan(pairQueenKicker);

  const fullHouseKingsFull = scoreFiveCardHand(parseHand(["Kd", "Kc", "Kh", "2s", "2d"]));
  const fullHouseQueensFull = scoreFiveCardHand(parseHand(["Qd", "Qc", "Qh", "As", "Ad"]));
  expect(fullHouseKingsFull).toBeGreaterThan(fullHouseQueensFull);

  const highCardBetterLast = scoreFiveCardHand(parseHand(["Ad", "Kc", "Qh", "Js", "9d"]));
  const highCardWorseLast = scoreFiveCardHand(parseHand(["Ah", "Ks", "Qd", "Jc", "8c"]));
  expect(highCardBetterLast).toBeGreaterThan(highCardWorseLast);
});

test("identical hands in different suits are true ties", () => {
  const clubsAndDiamonds = scoreFiveCardHand(parseHand(["Kd", "Kc", "Ah", "7s", "5d"]));
  const heartsAndSpades = scoreFiveCardHand(parseHand(["Kh", "Ks", "Ad", "7c", "5c"]));
  expect(clubsAndDiamonds).toBe(heartsAndSpades);
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
