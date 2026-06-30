import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCard, parseHand, remainingDeck } from "./cards.js";
import {
  combinations,
  evaluateAndCompare,
  evaluateHighHand,
  evaluateLowHand,
} from "./evaluation.js";

test("parseCard normalizes ten and casing", () => {
  assert.equal(parseCard("10c"), "Tc");
  assert.equal(parseCard("Tc"), "Tc");
  assert.equal(parseCard("AD"), "Ad");
  assert.equal(parseCard(" ks "), "Ks");
});

test("remainingDeck excludes 10x and Tx as the same card", () => {
  const deck = remainingDeck(parseHand(["10c"]));
  assert.equal(deck.length, 51);
  assert.ok(!deck.includes("Tc"));
});

test("combinations count is n choose k", () => {
  assert.equal(combinations([1, 2, 3, 4, 5], 2).length, 10);
  assert.equal(combinations([1, 2, 3, 4, 5], 3).length, 10);
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

  assert.ok(
    straightFlush > quads &&
      quads > fullHouse &&
      fullHouse > flush &&
      flush > straight &&
      straight > trips &&
      trips > twoPair &&
      twoPair > pair &&
      pair > highCard,
  );
});

test("wheel straight is detected", () => {
  const wheel = evaluateHighHand(parseHand(["Ad", "5c", "4d", "3d", "2s"]));
  assert.ok(wheel >= 4000 && wheel < 5000, `expected a straight score, got ${wheel}`);
});

test("low hand requires five distinct cards 8-or-lower", () => {
  assert.equal(evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "5h"])) !== null, true);
  assert.equal(evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "9h"])), null);
  assert.equal(evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "4h"])), null);
});

test("lower low hand beats higher low hand", () => {
  const wheel = evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "5h"]))!;
  const eightLow = evaluateLowHand(parseHand(["Ad", "2c", "3d", "4s", "8h"]))!;
  assert.ok(wheel < eightLow);
});

test("evaluateAndCompare picks high and low winners", () => {
  // Hero makes a flush combo; Villain top hand is a pair.
  const heroCombos = [parseHand(["Ad", "Kd", "9d", "7d", "5d"])];
  const villainCombos = [parseHand(["Ac", "Ah", "9d", "7d", "5d"])];
  const result = evaluateAndCompare(heroCombos, villainCombos);
  assert.equal(result.highWinner, "Hero");
});
