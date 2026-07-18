import type { HTMLAttributes } from "react";

/** Muted helper text. */
export function Hint({ className = "", ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm text-slate-500 dark:text-slate-400 ${className}`} {...props} />;
}

/** Inline error message. */
export function ErrorText({ className = "", ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`text-sm font-semibold text-red-700 dark:text-red-400 ${className}`}
      {...props}
    />
  );
}
