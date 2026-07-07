/**
 * The user's poker game type selection.
 *
 * The server's user_settings table is the source of truth (GET/PUT /settings
 * on the backend); localStorage only caches the last known value so the
 * simulator can render the right game immediately, before the fetch lands.
 */

export type GameType = "big-o" | "holdem" | "plo";

export interface GameConfig {
  label: string;
  description: string;
  handSize: number;
  defaultHero: string;
  defaultVillain: string;
  defaultBoard: string;
}

export const GAMES: Record<GameType, GameConfig> = {
  "big-o": {
    label: "Big O",
    description: "5-card Omaha Hi-Lo, 8-or-better",
    handSize: 5,
    defaultHero: "4c 4d 5c Kh 3c",
    defaultVillain: "Ad 2h 4s Qc 10s",
    defaultBoard: "2d 3s 9d 6c",
  },
  holdem: {
    label: "No Limit Hold'em",
    description: "2 hole cards, best five of seven, high hand only",
    handSize: 2,
    defaultHero: "As Ks",
    defaultVillain: "Qd Qc",
    defaultBoard: "",
  },
    plo: {
    label: "PLO",
    description: "4-card Omaha Hi",
    handSize: 4,
    defaultHero: "As 5c 4d Kc",
    defaultVillain: "Ah Ac Kd 4c",
    defaultBoard: "Ad 5d 4s Ks Tc",
  },
};

const STORAGE_KEY = "gameType";

export function loadCachedGameType(): GameType {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "big-o" || stored === "holdem"|| stored === "plo" ? stored : "big-o";
}

export function cacheGameType(type: GameType): void {
  localStorage.setItem(STORAGE_KEY, type);
}
