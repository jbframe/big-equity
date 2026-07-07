import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { toApiCards } from "./api/cards";
import { UnauthorizedError } from "./api/client";
import { createResult, fetchSettings } from "./api/endpoints";
import { GAMES, cacheGameType, loadCachedGameType } from "./gameType";
import PastResults from "./PastResults";
import { HoldemResults, BigOResults, PLOResults } from "./Results";
import { parseHand } from "./sim/cards";
import type { HoldemSimulationResult } from "./sim/holdem";
import { simulateHoldemBoard } from "./sim/holdem";
import type { SimulationResult } from "./sim/simulation";
import type { PLOSimulationResult } from "./sim/plo-simulation";
import { simulateBoard } from "./sim/simulation";
import { simulatePLOBoard } from "./sim/plo-simulation";


function splitCards(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// A finished run keeps the inputs that produced it, so saving stays correct
// even after the form is edited. The game type is captured too: only Big O
// runs can be saved (the backend contract is Hi-Lo-specific).
type CompletedRun = {
  heroHand: string[];
  villainHand: string[];
  board: string[];
} & (
    | { gameType: "big-o"; result: SimulationResult }
    | { gameType: "holdem"; result: HoldemSimulationResult }
    | { gameType: "plo"; result: PLOSimulationResult }
  );

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string };

type Tab = "simulator" | "past";

export default function App() {
  // Render with the cached game type immediately, then reconcile with the
  // server (source of truth) — another device may have changed it. Falls back
  // to the cache silently when the fetch fails.
  const [gameType, setGameType] = useState(() => loadCachedGameType());
  const game = GAMES[gameType];

  const [tab, setTab] = useState<Tab>("simulator");
  const [hero, setHero] = useState(game.defaultHero);
  const [villain, setVillain] = useState(game.defaultVillain);
  const [board, setBoard] = useState(game.defaultBoard);
  const [simulations, setSimulations] = useState(10_000);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<CompletedRun | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then(({ gameType: serverGameType }) => {
        // `gameType` here is the mount-time cached value: this effect runs
        // once and nothing else changes the game type within this page.
        if (cancelled || serverGameType === gameType) return;
        cacheGameType(serverGameType);
        // Hand sizes differ between games, so a stale form can't carry over.
        const next = GAMES[serverGameType];
        setGameType(serverGameType);
        setHero(next.defaultHero);
        setVillain(next.defaultVillain);
        setBoard(next.defaultBoard);
        setError(null);
        setLastRun(null);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  function validate(): string | null {
    const heroCards = splitCards(hero);
    const villainCards = splitCards(villain);
    const boardCards = splitCards(board);

    if (heroCards.length !== game.handSize) {
      return `Hero hand must have exactly ${game.handSize} cards.`;
    }
    if (villainCards.length !== game.handSize) {
      return `Villain hand must have exactly ${game.handSize} cards.`;
    }
    if (boardCards.length > 5) return "Board can have at most 5 cards.";

    let parsed: string[];
    try {
      parsed = parseHand([...heroCards, ...villainCards, ...boardCards]);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    if (new Set(parsed).size !== parsed.length) return "Duplicate card in play.";
    if (!Number.isInteger(simulations) || simulations < 1) {
      return "Simulations must be a positive whole number.";
    }
    return null;
  }

  function run() {
    const problem = validate();
    if (problem) {
      setError(problem);
      setLastRun(null);
      return;
    }
    setError(null);
    setRunning(true);
    // Let React paint the "Running…" state before the sim blocks the thread.
    setTimeout(() => {
      const heroHand = splitCards(hero);
      const villainHand = splitCards(villain);
      const boardCards = splitCards(board);
      try {
        const inputs = { heroHand, villainHand, board: boardCards };
        if (gameType === 'holdem') {
          setLastRun({
            gameType,
            result: simulateHoldemBoard(heroHand, villainHand, boardCards, simulations),
            ...inputs,
          })
        }
        if (gameType === 'big-o') {
          setLastRun({
            gameType,
            result: simulateBoard(heroHand, villainHand, boardCards, simulations),
            ...inputs,
          })
        }
        if (gameType === 'plo') {
          setLastRun({
            gameType,
            result: simulatePLOBoard(heroHand, villainHand, boardCards, simulations),
            ...inputs,
          })
        }


        setSaveState({ status: "idle" });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLastRun(null);
      } finally {
        setRunning(false);
      }
    }, 20);
  }

  async function save() {
    if (!lastRun || lastRun.gameType !== "big-o") return;
    setSaveState({ status: "saving" });
    try {
      await createResult({
        ...lastRun.result,
        source: "web",
        heroHand: toApiCards(lastRun.heroHand),
        villainHand: toApiCards(lastRun.villainHand),
        board: toApiCards(lastRun.board),
      });
      setSaveState({ status: "saved" });
    } catch (e) {
      const message =
        e instanceof UnauthorizedError
          ? "Your session has expired — reload the page to sign in again."
          : e instanceof Error
            ? e.message
            : String(e);
      setSaveState({ status: "error", message });
    }
  }

  function renderResults(lastRun: CompletedRun | null): React.ReactElement | null {
    if (lastRun === null) {
      return null;
    }
    if (lastRun.gameType === 'holdem') {
      return <HoldemResults result={lastRun.result} />;
    }
    if (lastRun.gameType === 'big-o') {
      return <BigOResults result={lastRun.result} />;
    }
    return <PLOResults result={lastRun.result} />;
  }



  return (
    <>
      <p className="hint">
        Game: <strong>{game.label}</strong> ({game.description}) ·{" "}
        <Link to="/settings">change</Link>
      </p>
      <div className="tabs" role="tablist" aria-label="Views">
        <button
          type="button"
          role="tab"
          id="tab-simulator"
          aria-selected={tab === "simulator"}
          aria-controls="panel-simulator"
          className={tab === "simulator" ? "tab active" : "tab"}
          onClick={() => setTab("simulator")}
        >
          Simulator
        </button>
        <button
          type="button"
          role="tab"
          id="tab-past"
          aria-selected={tab === "past"}
          aria-controls="panel-past"
          className={tab === "past" ? "tab active" : "tab"}
          onClick={() => setTab("past")}
        >
          Past results
        </button>
      </div>

      {tab === "past" ? (
        <div id="panel-past" role="tabpanel" aria-labelledby="tab-past">
          <PastResults />
        </div>
      ) : (
        <div id="panel-simulator" role="tabpanel" aria-labelledby="tab-simulator">
          <p className="hint">
            Cards as rank + suit, separated by spaces (e.g. <code>Ad 5d 4s Ks Tc</code>). Ten is{" "}
            <code>T</code> or <code>10</code>; suits are <code>c d h s</code>.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <label>
              Hero hand ({game.handSize} cards)
              <input value={hero} onChange={(e) => setHero(e.target.value)} />
            </label>
            <label>
              Villain hand ({game.handSize} cards)
              <input value={villain} onChange={(e) => setVillain(e.target.value)} />
            </label>
            <label>
              Board (0–5 cards)
              <input value={board} onChange={(e) => setBoard(e.target.value)} />
            </label>
            <label>
              Simulations
              <input
                type="number"
                min={1}
                step={1}
                value={simulations}
                onChange={(e) => setSimulations(Number(e.target.value))}
              />
            </label>
            <button type="submit" disabled={running}>
              {running ? "Running…" : "Run simulation"}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          {lastRun && !running && (
            <>
              {renderResults(lastRun)}
              {lastRun.gameType === "big-o" && (
                <div className="save">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saveState.status === "saving" || saveState.status === "saved"}
                  >
                    {saveState.status === "saving"
                      ? "Saving…"
                      : saveState.status === "saved"
                        ? "Saved ✓"
                        : "Save result"}
                  </button>
                  {saveState.status === "error" && <p className="error">{saveState.message}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
