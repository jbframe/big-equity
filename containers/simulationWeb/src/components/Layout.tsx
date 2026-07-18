import { Link, Outlet, useLocation } from "react-router-dom";

import { useAuth, useLoginHref } from "../auth";

const navLinkClass =
  "font-medium text-slate-500 transition-colors hover:text-slate-900 " +
  "dark:text-slate-400 dark:hover:text-(--font-color)";

export default function Layout() {
  const onSettings = useLocation().pathname === "/settings";
  const auth = useAuth();
  const loginHref = useLoginHref();

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          <Link to="/" className="transition-opacity hover:opacity-75">
            <span aria-hidden="true" className="mr-1.5 text-emerald-600 dark:text-emerald-500">
              ♠
            </span>
            Poker Equity
          </Link>
        </h1>
        <nav className="flex gap-4 text-sm" aria-label="Account">
          {onSettings ? (
            <Link to="/" className={navLinkClass}>
              Simulator
            </Link>
          ) : (
            <Link to="/settings" className={navLinkClass}>
              Settings
            </Link>
          )}
          {/* Nothing while auth state loads — the right link pops in rather
              than flashing the wrong one. */}
          {auth.status === "authenticated" && (
            <a href="/auth/logout" className={navLinkClass}>
              Log out
            </a>
          )}
          {auth.status === "anonymous" && (
            <a href={loginHref} className={navLinkClass}>
              Log in
            </a>
          )}
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
