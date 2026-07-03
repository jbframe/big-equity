/**
 * Card representation and deck utilities.
 *
 * A card is stored in canonical form as a two-character string: a rank
 * character drawn from `23456789TJQKA` followed by a suit character drawn
 * from `cdhs` (e.g. `"Td"`, `"As"`). Tens are always `T`, never `10`.
 */

export const RANKS = "23456789TJQKA" as const;
export const SUITS = "cdhs" as const;

export type Card = string;

/**
 * Normalize a loosely-typed card string into canonical form.
 *
 * Accepts ten written as either `10` or `T`/`t`, and any letter casing for
 * rank and suit (e.g. `"10c"`, `"Tc"`, `"AD"` -> `"Tc"`, `"Tc"`, `"Ad"`).
 */
export function parseCard(raw: string): Card {
  const card = raw.trim();
  let rank: string;
  let suit: string;

  if (card.startsWith("10")) {
    rank = "T";
    suit = card.slice(2);
  } else {
    rank = card[0] ?? "";
    suit = card.slice(1);
  }

  rank = rank.toUpperCase();
  suit = suit.toLowerCase();

  if (!RANKS.includes(rank as never)) {
    throw new Error(`Invalid card rank in "${raw}"`);
  }
  if (!SUITS.includes(suit as never)) {
    throw new Error(`Invalid card suit in "${raw}"`);
  }
  return rank + suit;
}

export function parseHand(raw: readonly string[]): Card[] {
  return raw.map(parseCard);
}

/** The full 52-card deck in canonical form. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

/**
 * Cards remaining in the deck after removing every card already in play.
 * All inputs are normalized first so `10x` and `Tx` collapse to one card.
 */
export function remainingDeck(...inPlay: readonly Card[][]): Card[] {
  const used = new Set<Card>(inPlay.flat().map(parseCard));
  return fullDeck().filter((card) => !used.has(card));
}

/** In-place Fisher-Yates shuffle. Returns the same array for convenience. */
export function shuffle<T>(array: T[], rng: () => number = Math.random): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i]!;
    array[i] = array[j]!;
    array[j] = tmp;
  }
  return array;
}
