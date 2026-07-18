import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { toApiCards } from "../api/cards";
import { UnauthorizedError } from "../api/client";
import { createResult, fetchSettings } from "../api/endpoints";
import { useAuth, useLoginHref } from "../auth";
import Button from "../components/Button";
import CardChips from "../components/CardChips";
import { BigOResults, HighResults } from "../components/Results";
import { Tab, TabList } from "../components/Tabs";
import { ErrorText, Hint } from "../components/Text";
import TextField from "../components/TextField";
import { cardClass, linkClass } from "../components/theme";
import { GAMES, cacheGameType, loadCachedGameType } from "../gameType";
import { parseHand } from "../sim/cards";
import type { HighOnlyResult, HiLoResult } from "../sim/engine";
import { simulate } from "../sim/engine";
import PastResults from "./PastResults";

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
    | { gameType: "big-o"; result: HiLoResult }
    | { gameType: "holdem" | "plo"; result: HighOnlyResult }
  );

type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; message: string };

type Tab = "simulator" | "past";

export default function SimulatorPage() {
  const auth = useAuth();
  const loginHref = useLoginHref();

  // Render with the cached game type immediately, then reconcile with the
  // server (source of truth) — another device may have changed it. Falls back
  // to the cache silently when the fetch fails. Anonymous users have no
  // server row, so the cache is their only source and the fetch is skipped.
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
    if (auth.status !== "authenticated") return;
    let cancelled = false;
    fetchSettings()
      .then(({ gameType: serverGameType }) => {
        // `gameType` here is the value cached before the fetch: this effect
        // fires once auth resolves and nothing else changes the game type
        // within this page.
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
  }, [auth.status]);

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
        // The branch keeps the result type tied to the game type: each arm
        // hits a different `simulate` overload.
        if (gameType === "big-o") {
          setLastRun({
            gameType,
            result: simulate(gameType, heroHand, villainHand, boardCards, simulations),
            ...inputs,
          });
        } else {
          setLastRun({
            gameType,
            result: simulate(gameType, heroHand, villainHand, boardCards, simulations),
            ...inputs,
          });
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
          ? "Your session has expired — log in again to save results."
          : e instanceof Error
            ? e.message
            : String(e);
      setSaveState({ status: "error", message });
    }
  }

  function renderResults(lastRun: CompletedRun): React.ReactElement | null {
    const resultsClass = `mt-6 p-5 ${cardClass}`;
    if (lastRun.gameType === "big-o") {
      return <BigOResults result={lastRun.result} className={resultsClass} />;
    }
    return <HighResults result={lastRun.result} className={resultsClass} />;
  }

  return (
    <>
      <Hint className="mt-1">
        Game: <strong className="font-semibold text-slate-700 dark:text-(--font-color)">{game.label}</strong>{" "}
        ({game.description}) ·{" "}
        <Link to="/settings" className={linkClass}>
          change
        </Link>
      </Hint>
      <TabList label="Views">
        <Tab
          id="tab-simulator"
          controls="panel-simulator"
          active={tab === "simulator"}
          onClick={() => setTab("simulator")}
        >
          Simulator
        </Tab>
        <Tab
          id="tab-past"
          controls="panel-past"
          active={tab === "past"}
          onClick={() => setTab("past")}
        >
          Past results
        </Tab>
      </TabList>

      {tab === "past" ? (
        <div id="panel-past" role="tabpanel" aria-labelledby="tab-past">
          <PastResults />
        </div>
      ) : (
        <div id="panel-simulator" role="tabpanel" aria-labelledby="tab-simulator">
          <Hint className="mb-4">
            Cards as rank + suit, separated by spaces (e.g.{" "}
            <code className="font-mono text-slate-700 dark:text-slate-300">Ad 5d 4s Ks Tc</code>).
            Ten is <code className="font-mono">T</code> or <code className="font-mono">10</code>;
            suits are <code className="font-mono">c d h s</code>.
          </Hint>

          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <TextField
              label={`Hero hand (${game.handSize} cards)`}
              mono
              value={hero}
              onChange={(e) => setHero(e.target.value)}
            />
            <TextField
              label={`Villain hand (${game.handSize} cards)`}
              mono
              value={villain}
              onChange={(e) => setVillain(e.target.value)}
            />
            <TextField
              label="Board (0–5 cards)"
              mono
              className="sm:col-span-2"
              value={board}
              onChange={(e) => setBoard(e.target.value)}
            />
            <TextField
              label="Simulations"
              type="number"
              min={1}
              step={1}
              value={simulations}
              onChange={(e) => setSimulations(Number(e.target.value))}
            />
            <div className="self-end sm:col-span-1">
              <Button type="submit" disabled={running}>
                {running ? "Running…" : "Run simulation"}
              </Button>
            </div>
          </form>

          {error && <ErrorText className="mt-4">{error}</ErrorText>}

          {lastRun && !running && (
            <>
              <div className="mt-6 grid gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6">
                <span>
                  Hero <CardChips cards={lastRun.heroHand} />
                </span>
                <span>
                  Villain <CardChips cards={lastRun.villainHand} />
                </span>
                <span>
                  Board <CardChips cards={lastRun.board} />
                </span>
              </div>
              {renderResults(lastRun)}
              {lastRun.gameType === "big-o" &&
                (auth.status === "authenticated" ? (
                  <div className="mt-4">
                    <Button
                      variant="subtle"
                      onClick={() => void save()}
                      disabled={saveState.status === "saving" || saveState.status === "saved"}
                    >
                      {saveState.status === "saving"
                        ? "Saving…"
                        : saveState.status === "saved"
                          ? "Saved ✓"
                          : "Save result"}
                    </Button>
                    {saveState.status === "error" && (
                      <ErrorText className="mt-2">{saveState.message}</ErrorText>
                    )}
                  </div>
                ) : (
                  <Hint className="mt-4">
                    <a href={loginHref} className={linkClass}>
                      Log in
                    </a>{" "}
                    to save this result.
                  </Hint>
                ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
