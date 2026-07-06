/**
 * The user's poker game type selection.
 *
 * The server's user_settings table is the source of truth (GET/PUT /settings
 * on the backend); localStorage only caches the last known value so the
 * simulator can render the right game immediately, before the fetch lands.
 */

export type GameType = "big-o" | "holdem";

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
    defaultHero: "Ad 5d 4s Ks Tc",
    defaultVillain: "Ah Ac Kd 4c 2h",
    defaultBoard: "3s 9d Js",
  },
  holdem: {
    label: "No Limit Hold'em",
    description: "2 hole cards, best five of seven, high hand only",
    handSize: 2,
    defaultHero: "As Ks",
    defaultVillain: "Qd Qc",
    defaultBoard: "",
  },
};

const STORAGE_KEY = "gameType";

export function loadCachedGameType(): GameType {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "big-o" || stored === "holdem" ? stored : "big-o";
}

export function cacheGameType(type: GameType): void {
  localStorage.setItem(STORAGE_KEY, type);
}
