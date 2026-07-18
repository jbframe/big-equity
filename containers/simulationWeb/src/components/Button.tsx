import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700 " +
    "dark:bg-emerald-600 dark:hover:bg-emerald-500",
  subtle:
    "bg-white text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 " +
    "dark:bg-(--panel-background) dark:text-(--font-color) dark:ring-(--color-panel-border) dark:hover:bg-(--input-background)",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
};

export default function Button({ variant = "primary", type = "button", className = "", ...props }: Props) {
  return (
    <button
      type={type}
      className={
        "inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold " +
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 " +
        `disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`
      }
      {...props}
    />
  );
}
