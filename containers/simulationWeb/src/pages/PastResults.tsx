import { useEffect, useState } from "react";

import { fromApiCards } from "../api/cards";
import { UnauthorizedError } from "../api/client";
import { listResults } from "../api/endpoints";
import type { StoredResult } from "../api/types";
import { useAuth, useLoginHref } from "../auth";
import { BigOResults } from "../components/Results";
import { ErrorText, Hint } from "../components/Text";
import { cardClass, linkClass } from "../components/theme";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; results: StoredResult[] };

export default function PastResults() {
  const auth = useAuth();
  const loginHref = useLoginHref();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    // Results live in the backend keyed to the signed-in user; anonymous
    // visitors have none to fetch (the request would just 401).
    if (auth.status !== "authenticated") return;
    let cancelled = false;
    listResults()
      .then(({ results }) => {
        if (!cancelled) setState({ status: "loaded", results });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message =
          e instanceof UnauthorizedError
            ? "Your session has expired — log in again to see saved results."
            : e instanceof Error
              ? e.message
              : String(e);
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  if (auth.status === "anonymous") {
    return (
      <Hint>
        <a href={loginHref} className={linkClass}>
          Log in
        </a>{" "}
        to save simulation results and see them here.
      </Hint>
    );
  }
  if (auth.status === "loading" || state.status === "loading") {
    return <Hint>Loading saved results…</Hint>;
  }
  if (state.status === "error") {
    return <ErrorText>{state.message}</ErrorText>;
  }
  if (state.results.length === 0) {
    return <Hint>No saved results yet. Run a simulation and save it.</Hint>;
  }

  return (
    <ul className="grid gap-3">
      {state.results.map((r) => (
        <PastResultRow
          key={r.id}
          result={r}
          open={openId === r.id}
          onToggle={() => setOpenId(openId === r.id ? null : r.id)}
        />
      ))}
    </ul>
  );
}

function PastResultRow({
  result,
  open,
  onToggle,
}: {
  result: StoredResult;
  open: boolean;
  onToggle: () => void;
}) {
  const hero = fromApiCards(result.heroHand).join(" ");
  const villain = fromApiCards(result.villainHand).join(" ");
  const board = fromApiCards(result.board).join(" ");
  const mono = "font-mono text-slate-700 dark:text-slate-300";

  return (
    <li className={`overflow-hidden ${cardClass}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-(--input-background)/50"
      >
        <span className="grid gap-0.5 text-sm">
          <span>
            Hero <code className={mono}>{hero}</code> vs Villain{" "}
            <code className={mono}>{villain}</code>
          </span>
          <Hint className="m-0">
            Board {board === "" ? "—" : <code className={mono}>{board}</code>} ·{" "}
            {result.simulations.toLocaleString()} simulations · saved {result.createdAt}
          </Hint>
        </span>
        <strong className="whitespace-nowrap text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {result.heroEquity.toFixed(3)}%
        </strong>
      </button>
      {open && (
        <BigOResults
          result={result}
          className="border-t border-slate-200 px-4 py-4 dark:border-(--color-panel-border)"
        />
      )}
    </li>
  );
}
