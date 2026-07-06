import { useState } from "react";

import { toApiCards } from "./api/cards";
import { UnauthorizedError } from "./api/client";
import { createResult } from "./api/endpoints";
import { parseHand } from "./sim/cards";
import type { SimulationResult } from "./sim/simulation";
import { simulateBoard } from "./sim/simulation";

const DEFAULT_HERO = "Ad 5d 4s Ks Tc";
const DEFAULT_VILLAIN = "Ah Ac Kd 4c 2h";
const DEFAULT_BOARD = "3s 9d Js";

function splitCards(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

const pct = (n: number, total: number): string =>
  total === 0 ? "0.00" : ((n / total) * 100).toFixed(2);

// A finished run keeps the inputs that produced it, so saving stays correct
// even after the form is edited.
interface CompletedRun {
  result: SimulationResult;
  heroHand: string[];
  villainHand: string[];
  board: string[];
}

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string };

export default function App() {
  const [hero, setHero] = useState(DEFAULT_HERO);
  const [villain, setVillain] = useState(DEFAULT_VILLAIN);
  const [board, setBoard] = useState(DEFAULT_BOARD);
  const [simulations, setSimulations] = useState(10_000);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<CompletedRun | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  function validate(): string | null {
    const heroCards = splitCards(hero);
    const villainCards = splitCards(villain);
    const boardCards = splitCards(board);

    if (heroCards.length !== 5) return "Hero hand must have exactly 5 cards.";
    if (villainCards.length !== 5) return "Villain hand must have exactly 5 cards.";
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
        setLastRun({
          result: simulateBoard(heroHand, villainHand, boardCards, simulations),
          heroHand,
          villainHand,
          board: boardCards,
        });
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
    if (!lastRun) return;
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

  return (
    <main className="app">
      <header className="app-header">
        <h1>Poker Hi-Lo Equity</h1>
        <a className="logout" href="/auth/logout">
          Log out
        </a>
      </header>
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
          Hero hand (5 cards)
          <input value={hero} onChange={(e) => setHero(e.target.value)} />
        </label>
        <label>
          Villain hand (5 cards)
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
          <Results result={lastRun.result} />
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
        </>
      )}
    </main>
  );
}

function Results({ result }: { result: SimulationResult }) {
  const { simulations: sims, high, low, scoop, noScoop } = result;
  const none = scoop.none;

  return (
    <section className="results">
      <h2>
        Hero equity: <strong>{result.heroEquity.toFixed(3)}%</strong>
      </h2>
      <p className="hint">{sims.toLocaleString()} simulations</p>

      <h3>High hand</h3>
      <p>
        Hero wins {pct(high.heroWins, sims)}% · Villain wins {pct(high.villainWins, sims)}% ·
        Splits {pct(high.splits, sims)}%
      </p>

      <h3>Low hand</h3>
      <p>
        No low {pct(low.noLow, sims)}% · Hero wins {pct(low.heroWins, sims)}% · Villain wins{" "}
        {pct(low.villainWins, sims)}% · Splits {pct(low.splits, sims)}%
      </p>

      <h3>Scoop</h3>
      <p>
        Hero scoops {pct(scoop.hero, sims)}% · Villain scoops {pct(scoop.villain, sims)}% · No
        scoop {pct(none, sims)}%
      </p>

      <h3>When nobody scoops</h3>
      <p>
        High — Hero wins {pct(noScoop.high.heroWins, none)}% · Villain wins{" "}
        {pct(noScoop.high.villainWins, none)}% · Splits {pct(noScoop.high.splits, none)}%
      </p>
      <p>
        Low — Hero wins {pct(noScoop.low.heroWins, none)}% · Villain wins{" "}
        {pct(noScoop.low.villainWins, none)}% · Splits {pct(noScoop.low.splits, none)}% · No low{" "}
        {pct(noScoop.low.noLow, none)}%
      </p>
    </section>
  );
}
