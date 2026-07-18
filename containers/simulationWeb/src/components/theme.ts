/**
 * Shared class strings for styles that recur across components but don't
 * warrant a component of their own (plain anchors, surface containers).
 */

/** Inline text link — works on both <a> and react-router <Link>. */
export const linkClass =
  "font-medium text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 " +
  "hover:text-emerald-600 dark:text-(--link-color) dark:decoration-(--link-color)/40 dark:hover:text-(--link-color-focus)";

/** Raised card surface for panels (results, list rows, form sections). */
export const cardClass =
  "rounded-xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-(--panel-background) dark:ring-(--color-panel-border)";
