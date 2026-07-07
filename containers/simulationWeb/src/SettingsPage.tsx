import { useEffect, useState } from "react";

import { UnauthorizedError } from "./api/client";
import { fetchSettings, updateSettings } from "./api/endpoints";
import { useAuth, useLoginHref } from "./auth";
import type { GameType } from "./gameType";
import { GAMES, cacheGameType, loadCachedGameType } from "./gameType";

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string };

const GAME_TYPE_ORDER: GameType[] = ["big-o", "holdem", "plo"];

function errorMessage(e: unknown): string {
  return e instanceof UnauthorizedError
    ? "Your session has expired — log in again to sync settings."
    : e instanceof Error
      ? e.message
      : String(e);
}

export default function SettingsPage() {
  const auth = useAuth();
  const loginHref = useLoginHref();
  // Render the cached choice immediately; for a signed-in user the server
  // value replaces it when the fetch lands (it's the source of truth, this
  // browser may be stale). Anonymous users keep the cache — it's all they
  // have, and choices persist only in this browser.
  const [gameType, setGameType] = useState<GameType>(() => loadCachedGameType());
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    let cancelled = false;
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
  }, [auth.status]);

  function choose(type: GameType) {
    // Optimistic: flip the radio and cache right away, then persist — to the
    // backend when signed in, to this browser only when not.
    setGameType(type);
    cacheGameType(type);
    if (auth.status !== "authenticated") {
      setSaveState({ status: "saved" });
      return;
    }
    setSaveState({ status: "saving" });
    updateSettings({ gameType: type })
      .then(() => setSaveState({ status: "saved" }))
      .catch((e) => setSaveState({ status: "error", message: errorMessage(e) }));
  }

  return (
    <section className="settings">
      <h2>Settings</h2>

      <h3>Account</h3>
      {auth.status === "loading" && <p className="hint">Loading…</p>}
      {auth.status === "anonymous" && (
        <p>
          Not signed in. <a href={loginHref}>Log in</a> to save results and sync
          settings across devices.
        </p>
      )}
      {auth.status === "authenticated" && (
        <p>
          Signed in as <strong>{auth.user.email ?? "(no email on this account)"}</strong>
        </p>
      )}

      <h3>Poker game type</h3>
      <p className="hint">
        Choose which simulator the Simulator tab runs.
        {auth.status === "anonymous" && " Saved in this browser only."}
      </p>
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
