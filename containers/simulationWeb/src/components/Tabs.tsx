import type { ReactNode } from "react";

export function TabList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 mt-4 flex gap-1 border-b border-slate-200 dark:border-(--color-panel-border)">
      {children}
    </div>
  );
}

export function Tab({
  id,
  controls,
  active,
  onClick,
  children,
}: {
  id: string;
  controls: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={
        "-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm transition-colors " +
        (active
          ? "border-emerald-600 font-semibold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400"
          : "border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800 " +
            "dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-(--font-color)")
      }
    >
      {children}
    </button>
  );
}
