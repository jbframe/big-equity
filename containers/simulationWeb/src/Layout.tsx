import { Link, Outlet, useLocation } from "react-router-dom";

import { useAuth, useLoginHref } from "./auth";

export default function Layout() {
  const onSettings = useLocation().pathname === "/settings";
  const auth = useAuth();
  const loginHref = useLoginHref();

  return (
    <main className="app">
      <header className="app-header">
        <h1>
          <Link to="/">Poker Equity</Link>
        </h1>
        <nav className="app-nav" aria-label="Account">
          {onSettings ? <Link to="/">Simulator</Link> : <Link to="/settings">Settings</Link>}
          {/* Nothing while auth state loads — the right link pops in rather
              than flashing the wrong one. */}
          {auth.status === "authenticated" && <a href="/auth/logout">Log out</a>}
          {auth.status === "anonymous" && <a href={loginHref}>Log in</a>}
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
