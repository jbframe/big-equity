/**
 * Entry point: run a couple of example Big O Hi-Lo matchups, mirroring the
 * original simulationV1 `main.py`.
 */

import { printResult, simulateBoard } from "./simulation.js";

function run(hero: string[], villain: string[], board: string[]): void {
  console.log(`hero_hand: ${JSON.stringify(hero)}`);
  console.log(`villain_hand: ${JSON.stringify(villain)}`);
  console.log(`board: ${JSON.stringify(board)}`);
  printResult(simulateBoard(hero, villain, board));
}

const heroHand = ["ad", "5d", "4s", "ks", "10c"];
const villainHand = ["ah", "ac", "kd", "4c", "2h"];

run(heroHand, villainHand, ["3s", "9d", "js"]);
run(heroHand, villainHand, ["3s", "8d", "jc"]);
