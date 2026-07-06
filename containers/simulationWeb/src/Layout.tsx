import { Link, Outlet, useLocation } from "react-router-dom";

export default function Layout() {
  const onSettings = useLocation().pathname === "/settings";

  return (
    <main className="app">
      <header className="app-header">
        <h1>
          <Link to="/">Poker Equity</Link>
        </h1>
        <nav className="app-nav" aria-label="Account">
          {onSettings ? <Link to="/">Simulator</Link> : <Link to="/settings">Settings</Link>}
          <a href="/auth/logout">Log out</a>
        </nav>
      </header>
      <Outlet />
    </main>
  );
}
