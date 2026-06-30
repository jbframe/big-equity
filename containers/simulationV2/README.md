# simulationV2

A TypeScript rewrite of `simulationV1` — a Monte Carlo equity simulator for
**Big O** (5-card Omaha Hi-Lo, 8-or-better). Each player holds 5 hole cards and
must use exactly 2 hole cards + 3 board cards. The pot is split between the best
high hand and the best qualifying low hand.

## Prerequisites

- Node.js 18+ (developed on Node 21)

## Setup

```sh
cd simulationV2
npm install
```

## Run

```sh
npm start        # run the example matchups in src/main.ts
npm test         # run the unit tests
npm run typecheck
npm run build    # emit JS + .d.ts to dist/
```

## Usage

```ts
import { simulateBoard, printResult } from "./src/simulation.js";

const hero = ["ad", "5d", "4s", "ks", "10c"];
const villain = ["ah", "ac", "kd", "4c", "2h"];
const board = ["3s", "9d", "js"]; // 0–5 board cards

printResult(simulateBoard(hero, villain, board, 10_000));
```

Cards are accepted in a loose format and normalized internally: rank +
suit, any casing, with ten written as either `10` or `T` (e.g. `"10c"`, `"Tc"`,
`"AD"`). Suits are `c d h s`.

## Layout

| File                  | Responsibility                                          |
| --------------------- | ------------------------------------------------------- |
| `src/cards.ts`        | Card parsing/normalization, deck, Fisher-Yates shuffle  |
| `src/evaluation.ts`   | 5-card high/low hand scoring and winner comparison      |
| `src/simulation.ts`   | Monte Carlo loop, equity math, result formatting        |
| `src/main.ts`         | Example matchups (entry point)                          |

## Relationship to simulationV1

The hand-scoring logic is a faithful port of the Python original.
