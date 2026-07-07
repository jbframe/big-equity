import { useEffect, useState } from "react";

import { fromApiCards } from "./api/cards";
import { UnauthorizedError } from "./api/client";
import { listResults } from "./api/endpoints";
import type { StoredResult } from "./api/types";
import { useAuth, useLoginHref } from "./auth";
import { BigOResults } from "./Results";

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
      <p className="hint">
        <a href={loginHref}>Log in</a> to save simulation results and see them here.
      </p>
    );
  }
  if (auth.status === "loading" || state.status === "loading") {
    return <p className="hint">Loading saved results…</p>;
  }
  if (state.status === "error") {
    return <p className="error">{state.message}</p>;
  }
  if (state.results.length === 0) {
    return <p className="hint">No saved results yet. Run a simulation and save it.</p>;
  }

  return (
    <ul className="past-results">
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

  return (
    <li className="past-result">
      <button type="button" className="past-result-summary" onClick={onToggle} aria-expanded={open}>
        <span className="past-result-hands">
          <span>
            Hero <code>{hero}</code> vs Villain <code>{villain}</code>
          </span>
          <span className="hint">
            Board {board === "" ? "—" : <code>{board}</code>} ·{" "}
            {result.simulations.toLocaleString()} simulations · saved {result.createdAt}
          </span>
        </span>
        <strong className="past-result-equity">{result.heroEquity.toFixed(3)}%</strong>
      </button>
      {open && <BigOResults result={result} />}
    </li>
  );
}
