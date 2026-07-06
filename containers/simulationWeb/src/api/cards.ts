/**
 * Conversion between the UI's card notation and the API's wire notation.
 *
 * The sim works with canonical display cards ("Tc", "Ad"); the backend
 * expects lowercase with tens written out ("10c", "ad") — see cardSchema in
 * containers/simulationAPI/src/backend/results.ts.
 */

import type { Card } from "../sim/cards";
import { parseCard } from "../sim/cards";
import type { ApiCard } from "./types";

export function toApiCard(raw: string): ApiCard {
  const card = parseCard(raw); // normalizes "10c"/"tc"/"TC" -> "Tc"
  const rank = card[0]!;
  const suit = card[1]!;
  return (rank === "T" ? "10" : rank.toLowerCase()) + suit;
}

export function toApiCards(cards: readonly string[]): ApiCard[] {
  return cards.map(toApiCard);
}

// parseCard already accepts the wire notation ("10c", "ad"), so the reverse
// conversion is just normalization back to canonical display form ("Tc", "Ad").
export function fromApiCards(cards: readonly ApiCard[]): Card[] {
  return cards.map(parseCard);
}
