/**
 * Client-side auth state. Login is optional: the gateway serves the SPA to
 * anonymous visitors, so the app asks /auth/me once at boot and every feature
 * that persists to the backend (save result, past results, settings sync)
 * gates itself on the answer. Anything that fails the check — a 401, an
 * expired session, or no backend at all — renders as "anonymous", which
 * keeps the simulator fully usable offline.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import { fetchMe } from "./api/endpoints";
import type { AuthUser } from "./api/types";

export type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "anonymous" };

const AuthContext = createContext<AuthState>({ status: "loading" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (!cancelled) setState({ status: "authenticated", user });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * Same-origin login URL that brings the user back to the page they left.
 * A plain href, not a router link — /auth/login is a gateway route, so the
 * whole flow is a full-page navigation through FusionAuth.
 */
export function useLoginHref(): string {
  const { pathname, search } = useLocation();
  return `/auth/login?rd=${encodeURIComponent(pathname + search)}`;
}
