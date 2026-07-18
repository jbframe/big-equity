import { useEffect, useState } from "react";

import { UnauthorizedError } from "../api/client";
import { fetchSettings, updateSettings } from "../api/endpoints";
import { useAuth, useLoginHref } from "../auth";
import { ErrorText, Hint } from "../components/Text";
import { linkClass } from "../components/theme";
import type { GameType } from "../gameType";
import { GAMES, cacheGameType, loadCachedGameType } from "../gameType";

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

const subheadClass = "mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

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
    <section className="mt-4">
      <h2 className="text-xl font-bold tracking-tight">Settings</h2>

      <h3 className={subheadClass}>Account</h3>
      {auth.status === "loading" && <Hint className="mt-2">Loading…</Hint>}
      {auth.status === "anonymous" && (
        <p className="mt-2 text-sm">
          Not signed in.{" "}
          <a href={loginHref} className={linkClass}>
            Log in
          </a>{" "}
          to save results and sync settings across devices.
        </p>
      )}
      {auth.status === "authenticated" && (
        <p className="mt-2 text-sm">
          Signed in as{" "}
          <strong className="font-semibold">
            {auth.user.email ?? "(no email on this account)"}
          </strong>
        </p>
      )}

      <h3 className={subheadClass}>Poker game type</h3>
      <Hint className="mt-2">
        Choose which simulator the Simulator tab runs.
        {auth.status === "anonymous" && " Saved in this browser only."}
      </Hint>
      <fieldset className="mt-3 grid gap-2">
        <legend className="sr-only">Poker game type</legend>
        {GAME_TYPE_ORDER.map((type) => (
          <label
            key={type}
            className={
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors " +
              (gameType === type
                ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-500/10"
                : "border-slate-200 bg-white hover:border-slate-300 dark:border-(--color-panel-border) dark:bg-(--panel-background) dark:hover:border-slate-600")
            }
          >
            <input
              type="radio"
              name="game-type"
              checked={gameType === type}
              onChange={() => choose(type)}
              className="mt-0.5 size-4 accent-emerald-600"
            />
            <span className="grid gap-0.5 text-sm">
              <span className="font-semibold">{GAMES[type].label}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {GAMES[type].description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {saveState.status === "saving" && <Hint className="mt-3">Saving…</Hint>}
      {saveState.status === "saved" && <Hint className="mt-3">Saved ✓</Hint>}
      {saveState.status === "error" && <ErrorText className="mt-3">{saveState.message}</ErrorText>}
    </section>
  );
}
