import type { FastifyRequest } from "fastify";

// The caller's identity as the backend sees it: the FusionAuth subject the
// gateway's session guard verified and forwarded as x-user-sub (deleting any
// client-supplied copy first, so it can't be spoofed). Every session-gated
// route keys its rows off this — results by owner, settings by user — so it
// lives here, once, rather than being re-read in each module.
//
// The guard refuses anonymous callers before any handler runs, so the header
// is always present here; a missing one is a wiring bug (the guard wasn't
// installed), not an anonymous request, hence the throw rather than a 401.
export function userSub(req: FastifyRequest): string {
  const sub = req.headers["x-user-sub"];
  if (typeof sub !== "string" || sub === "") {
    throw new Error("missing x-user-sub header behind the auth guard");
  }
  return sub;
}
