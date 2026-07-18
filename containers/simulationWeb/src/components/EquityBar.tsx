export type EquitySegment = {
  label: string;
  value: number;
  className: string;
};

/**
 * Stacked proportion bar for a win/split breakdown. Decorative — the exact
 * numbers are always in the adjacent text, so it's hidden from the
 * accessibility tree.
 */
export default function EquityBar({ segments, total }: { segments: EquitySegment[]; total: number }) {
  if (total <= 0) return null;
  return (
    <div
      aria-hidden="true"
      className="my-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-(--input-background)"
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.label}
            title={s.label}
            className={s.className}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}
