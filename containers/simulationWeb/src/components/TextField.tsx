import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  /** Monospace input — card notation lines up better in a fixed-width font. */
  mono?: boolean;
};

export default function TextField({ label, mono = false, className = "", ...props }: Props) {
  return (
    <label className={`grid gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 ${className}`}>
      {label}
      <input
        className={
          "rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 " +
          "shadow-sm transition-colors placeholder:text-slate-400 " +
          "focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 " +
          "dark:border-(--color-panel-border) dark:bg-(--input-background) dark:text-(--input-text) " +
          "dark:placeholder:text-(--color-input-placeholder) " +
          (mono ? "font-mono" : "")
        }
        {...props}
      />
    </label>
  );
}
