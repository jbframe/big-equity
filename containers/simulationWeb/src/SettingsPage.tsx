import { useEffect, useState } from "react";

import { UnauthorizedError } from "./api/client";
import { fetchMe, fetchSettings, updateSettings } from "./api/endpoints";
import type { GameType } from "./gameType";
import { GAMES, cacheGameType, loadCachedGameType } from "./gameType";

type EmailState =
  | { status: "loading" }
  | { status: "loaded"; email: string | null }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string };

const GAME_TYPE_ORDER: GameType[] = ["big-o", "holdem", "plo"];

function errorMessage(e: unknown): string {
  return e instanceof UnauthorizedError
    ? "Your session has expired — reload the page to sign in again."
    : e instanceof Error
      ? e.message
      : String(e);
}

export default function SettingsPage() {
  const [emailState, setEmailState] = useState<EmailState>({ status: "loading" });
  // Render the cached choice immediately; the server value replaces it when
  // the fetch lands (it's the source of truth, this browser may be stale).
  const [gameType, setGameType] = useState<GameType>(() => loadCachedGameType());
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (!cancelled) setEmailState({ status: "loaded", email: user.email });
      })
      .catch((e) => {
        if (!cancelled) setEmailState({ status: "error", message: errorMessage(e) });
      });
    fetchSettings()
      .then((settings) => {
        if (cancelled) return;
        cacheGameType(settings.gameType);
        setGameType(settings.gameType);
      })
      .catch((e) => {
        if (!cancelled) setSaveState({ status: "error", message: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function choose(type: GameType) {
    // Optimistic: flip the radio and cache right away, then persist.
    setGameType(type);
    cacheGameType(type);
    setSaveState({ status: "saving" });
    updateSettings({ gameType: type })
      .then(() => setSaveState({ status: "saved" }))
      .catch((e) => setSaveState({ status: "error", message: errorMessage(e) }));
  }

  return (
    <section className="settings">
      <h2>Settings</h2>

      <h3>Account</h3>
      {emailState.status === "loading" && <p className="hint">Loading…</p>}
      {emailState.status === "error" && <p className="error">{emailState.message}</p>}
      {emailState.status === "loaded" && (
        <p>
          Signed in as <strong>{emailState.email ?? "(no email on this account)"}</strong>
        </p>
      )}

      <h3>Poker game type</h3>
      <p className="hint">Choose which simulator the Simulator tab runs.</p>
      <fieldset className="game-type">
        <legend className="visually-hidden">Poker game type</legend>
        {GAME_TYPE_ORDER.map((type) => (
          <label key={type} className="radio-option">
            <input
              type="radio"
              name="game-type"
              checked={gameType === type}
              onChange={() => choose(type)}
            />
            <span>
              {GAMES[type].label}
              <span className="hint"> — {GAMES[type].description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {saveState.status === "saving" && <p className="hint">Saving…</p>}
      {saveState.status === "saved" && <p className="hint">Saved ✓</p>}
      {saveState.status === "error" && <p className="error">{saveState.message}</p>}
    </section>
  );
}
