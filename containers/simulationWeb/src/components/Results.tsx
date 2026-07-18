import type { ReactNode } from "react";

import type { HighOnlyResult, HiLoResult } from "../sim/engine";
import EquityBar from "./EquityBar";
import type { EquitySegment } from "./EquityBar";
import { Hint } from "./Text";

const pct = (n: number, total: number): string =>
  total === 0 ? "0.00" : ((n / total) * 100).toFixed(2);

// Segment palette: hero green, villain red, splits gray, "nothing" faint.
const HERO = "bg-emerald-500";
const VILLAIN = "bg-rose-500";
const SPLIT = "bg-slate-400 dark:bg-slate-500";
const NONE = "bg-slate-200 dark:bg-slate-700";

const seg = (label: string, value: number, className: string): EquitySegment => ({
  label,
  value,
  className,
});

function EquityHeadline({ equity, simulations }: { equity: number; simulations: number }) {
  return (
    <>
      <h2 className="text-base font-medium text-slate-600 dark:text-slate-300">
        Hero equity:{" "}
        <strong className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {equity.toFixed(3)}%
        </strong>
      </h2>
      <Hint>{simulations.toLocaleString()} simulations</Hint>
    </>
  );
}

function Breakdown({
  title,
  segments,
  total,
  children,
}: {
  title: string;
  segments?: EquitySegment[];
  total?: number;
  children: ReactNode;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-(--font-color)">{title}</h3>
      {segments && <EquityBar segments={segments} total={total ?? 0} />}
      <div className="grid gap-1 text-sm text-slate-600 dark:text-slate-400">{children}</div>
    </div>
  );
}

type ResultsProps<T> = {
  result: T;
  /** Container styling — pages pass a card or an embedded variant. */
  className?: string;
};

/** Results for high-only games (Hold'em, PLO). */
export function HighResults({ result, className = "" }: ResultsProps<HighOnlyResult>) {
  const { simulations: sims, high } = result;

  return (
    <section className={className}>
      <EquityHeadline equity={result.heroEquity} simulations={sims} />

      <Breakdown
        title="High hand"
        total={sims}
        segments={[
          seg("Hero wins", high.heroWins, HERO),
          seg("Splits", high.splits, SPLIT),
          seg("Villain wins", high.villainWins, VILLAIN),
        ]}
      >
        <p>
          Hero wins {pct(high.heroWins, sims)}% · Villain wins {pct(high.villainWins, sims)}% ·
          Splits {pct(high.splits, sims)}%
        </p>
      </Breakdown>
    </section>
  );
}

export function BigOResults({ result, className = "" }: ResultsProps<HiLoResult>) {
  const { simulations: sims, high, low, scoop, noScoop } = result;
  const none = scoop.none;

  return (
    <section className={className}>
      <EquityHeadline equity={result.heroEquity} simulations={sims} />

      <Breakdown
        title="High hand"
        total={sims}
        segments={[
          seg("Hero wins", high.heroWins, HERO),
          seg("Splits", high.splits, SPLIT),
          seg("Villain wins", high.villainWins, VILLAIN),
        ]}
      >
        <p>
          Hero wins {pct(high.heroWins, sims)}% · Villain wins {pct(high.villainWins, sims)}% ·
          Splits {pct(high.splits, sims)}%
        </p>
      </Breakdown>

      <Breakdown
        title="Low hand"
        total={sims}
        segments={[
          seg("Hero wins", low.heroWins, HERO),
          seg("Splits", low.splits, SPLIT),
          seg("Villain wins", low.villainWins, VILLAIN),
          seg("No low", low.noLow, NONE),
        ]}
      >
        <p>
          No low {pct(low.noLow, sims)}% · Hero wins {pct(low.heroWins, sims)}% · Villain wins{" "}
          {pct(low.villainWins, sims)}% · Splits {pct(low.splits, sims)}%
        </p>
      </Breakdown>

      <Breakdown
        title="Scoop"
        total={sims}
        segments={[
          seg("Hero scoops", scoop.hero, HERO),
          seg("Villain scoops", scoop.villain, VILLAIN),
          seg("No scoop", none, NONE),
        ]}
      >
        <p>
          Hero scoops {pct(scoop.hero, sims)}% · Villain scoops {pct(scoop.villain, sims)}% · No
          scoop {pct(none, sims)}%
        </p>
      </Breakdown>

      <Breakdown title="When nobody scoops">
        <p>
          High — Hero wins {pct(noScoop.high.heroWins, none)}% · Villain wins{" "}
          {pct(noScoop.high.villainWins, none)}% · Splits {pct(noScoop.high.splits, none)}%
        </p>
        <p>
          Low — Hero wins {pct(noScoop.low.heroWins, none)}% · Villain wins{" "}
          {pct(noScoop.low.villainWins, none)}% · Splits {pct(noScoop.low.splits, none)}% · No low{" "}
          {pct(noScoop.low.noLow, none)}%
        </p>
      </Breakdown>
    </section>
  );
}
