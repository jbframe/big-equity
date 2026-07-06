// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import AppRoutes from "./routes";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Routes fetch calls by pathname, minting a fresh Response per call (a body
// can only be consumed once). Unrouted paths reject like a network failure —
// the app treats that as "no backend", which is also what the unstubbed
// tests get from the real fetch.
function stubFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
    const handler = routes[path];
    if (!handler) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(handler(init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const settingsRoute =
  (gameType: "big-o" | "holdem" = "big-o") =>
  () =>
    jsonResponse({ gameType });

function setInput(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function runSimulation() {
  fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
}

test("renders the form with the example matchup prefilled", () => {
  renderApp();
  expect(screen.getByRole("heading", { name: /poker equity/i })).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>(/hero hand/i).value).toBe("Ad 5d 4s Ks Tc");
  expect(screen.getByLabelText<HTMLInputElement>(/villain hand/i).value).toBe("Ah Ac Kd 4c 2h");
  expect(screen.getByLabelText<HTMLInputElement>(/board/i).value).toBe("3s 9d Js");
});

test("rejects a hero hand without exactly 5 cards", () => {
  renderApp();
  setInput(/hero hand/i, "Ad 5d 4s Ks");
  runSimulation();
  expect(screen.getByText("Hero hand must have exactly 5 cards.")).toBeTruthy();
});

test("rejects an invalid card", () => {
  renderApp();
  setInput(/hero hand/i, "Ad 5d 4s Ks Xz");
  runSimulation();
  expect(screen.getByText(/invalid card rank/i)).toBeTruthy();
});

test("rejects duplicate cards across hands and board", () => {
  renderApp();
  // "10c" in the villain hand collides with hero's "Tc" once normalized.
  setInput(/villain hand/i, "Ah Ac Kd 4c 10c");
  runSimulation();
  expect(screen.getByText("Duplicate card in play.")).toBeTruthy();
});

test("runs a simulation and shows the results breakdown", async () => {
  renderApp();
  setInput(/simulations/i, "200");
  runSimulation();

  expect(await screen.findByText(/hero equity/i, undefined, { timeout: 5000 })).toBeTruthy();
  expect(screen.getByText(/200 simulations/i)).toBeTruthy();
  expect(screen.getByRole("heading", { name: /high hand/i })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Scoop", level: 3 })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "When nobody scoops", level: 3 })).toBeTruthy();
});

test("saves a result to the backend in API card notation", async () => {
  const fetchMock = stubFetch({
    "/settings": settingsRoute(),
    // Echo the payload back with id/createdAt, like the backend's insert does.
    "/results": (init) =>
      jsonResponse(
        {
          ...JSON.parse(init!.body as string),
          id: 1,
          createdAt: "2026-07-06 08:00:00+00",
        },
        201,
      ),
  });

  renderApp();
  setInput(/simulations/i, "50");
  runSimulation();
  await screen.findByText(/hero equity/i, undefined, { timeout: 5000 });

  fireEvent.click(screen.getByRole("button", { name: /save result/i }));

  expect(await screen.findByRole("button", { name: /saved/i })).toBeTruthy();
  const [, init] = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith("/results"),
  ) as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  expect(body.source).toBe("web");
  expect(body.heroHand).toEqual(["ad", "5d", "4s", "ks", "10c"]);
  expect(body.villainHand).toEqual(["ah", "ac", "kd", "4c", "2h"]);
  expect(body.board).toEqual(["3s", "9d", "js"]);
  expect(body.simulations).toBe(50);
});

test("shows an error when saving fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );

  renderApp();
  setInput(/simulations/i, "50");
  runSimulation();
  await screen.findByText(/hero equity/i, undefined, { timeout: 5000 });

  fireEvent.click(screen.getByRole("button", { name: /save result/i }));

  expect(await screen.findByText(/network error/i)).toBeTruthy();
  // The button recovers so the user can retry.
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: /save result/i }).disabled,
  ).toBe(false);
});

const storedResult = {
  id: 7,
  createdAt: "2026-07-05 12:00:00+00",
  source: "web",
  heroHand: ["ad", "5d", "4s", "ks", "10c"],
  villainHand: ["ah", "ac", "kd", "4c", "2h"],
  board: ["3s", "9d", "js"],
  simulations: 1000,
  heroEquity: 55.125,
  high: { heroWins: 500, villainWins: 400, splits: 100 },
  low: { heroWins: 300, villainWins: 200, splits: 100, noLow: 400 },
  scoop: { hero: 250, villain: 150, none: 600 },
  noScoop: {
    high: { heroWins: 300, villainWins: 200, splits: 100 },
    low: { heroWins: 200, villainWins: 150, splits: 50, noLow: 200 },
  },
};

function stubResultsList(results: unknown[]) {
  return stubFetch({
    "/settings": settingsRoute(),
    "/results": () => jsonResponse({ results }),
  });
}

test("the past results tab lists saved results in display notation", async () => {
  const fetchMock = stubResultsList([storedResult]);

  renderApp();
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));

  expect(await screen.findByText("Ad 5d 4s Ks Tc")).toBeTruthy();
  expect(screen.getByText("Ah Ac Kd 4c 2h")).toBeTruthy();
  expect(screen.getByText("55.125%")).toBeTruthy();
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).endsWith("/results")),
  ).toBe(true);

  // Expanding a row shows the full breakdown.
  fireEvent.click(screen.getByRole("button", { name: /ad 5d 4s ks tc/i }));
  expect(screen.getByText(/hero equity/i)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Scoop", level: 3 })).toBeTruthy();
});

test("the past results tab shows an empty state", async () => {
  stubResultsList([]);

  renderApp();
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));

  expect(await screen.findByText(/no saved results yet/i)).toBeTruthy();
});

test("the past results tab surfaces load failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

  renderApp();
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));

  expect(await screen.findByText(/network error/i)).toBeTruthy();
});

test("the simulator form keeps its values across tab switches", async () => {
  stubResultsList([]);

  renderApp();
  setInput(/hero hand/i, "As Ks Qs Js 9s");
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));
  await screen.findByText(/no saved results yet/i);
  fireEvent.click(screen.getByRole("tab", { name: /simulator/i }));

  expect(screen.getByLabelText<HTMLInputElement>(/hero hand/i).value).toBe("As Ks Qs Js 9s");
});

test("a locked full board shows 100% hero equity", async () => {
  renderApp();
  setInput(/hero hand/i, "As Ts 3h 4h 5h");
  setInput(/villain hand/i, "Ah Ad 9c 9d 8h");
  setInput(/board/i, "Ks Qs Js 2d 7c");
  setInput(/simulations/i, "50");
  runSimulation();

  expect(await screen.findByText("100.000%", undefined, { timeout: 5000 })).toBeTruthy();
});

function stubMe(email: string | null = "framejb@gmail.com") {
  return stubFetch({
    "/auth/me": () => jsonResponse({ sub: "user-1", email, name: null }),
    "/settings": settingsRoute(),
  });
}

test("the settings page shows the signed-in email", async () => {
  const fetchMock = stubMe();

  renderApp("/settings");

  expect(await screen.findByText("framejb@gmail.com")).toBeTruthy();
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/me")),
  ).toBe(true);
});

test("the header links to the settings page", async () => {
  stubMe();

  renderApp();
  fireEvent.click(screen.getByRole("link", { name: "Settings" }));

  expect(await screen.findByRole("heading", { name: "Settings", level: 2 })).toBeTruthy();
  expect(screen.getByRole("radio", { name: /big o/i })).toBeTruthy();
  expect((screen.getByRole("radio", { name: /big o/i }) as HTMLInputElement).checked).toBe(true);

  // On the settings page the nav link flips to Simulator, and back again.
  expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Simulator" }));
  expect(screen.getByRole("tab", { name: /simulator/i })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Simulator" })).toBeNull();
  expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
});

test("choosing No Limit Hold'em saves to the backend and switches the simulator", async () => {
  // Stateful settings stub: a PUT changes what later GETs return, like the
  // backend's upsert.
  let serverGameType = "big-o";
  const fetchMock = stubFetch({
    "/auth/me": () => jsonResponse({ sub: "user-1", email: "framejb@gmail.com", name: null }),
    "/settings": (init) => {
      if (init?.method === "PUT") {
        serverGameType = JSON.parse(init.body as string).gameType;
      }
      return jsonResponse({ gameType: serverGameType });
    },
  });

  renderApp("/settings");
  fireEvent.click(await screen.findByRole("radio", { name: /no limit hold'em/i }));

  expect(await screen.findByText("Saved ✓")).toBeTruthy();
  expect(serverGameType).toBe("holdem");
  expect(localStorage.getItem("gameType")).toBe("holdem");
  const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
  expect(String(putCall?.[0]).endsWith("/settings")).toBe(true);

  // Back to the simulator, now in Hold'em mode with 2-card hands.
  fireEvent.click(screen.getByRole("link", { name: /poker equity/i }));
  expect(screen.getByLabelText(/hero hand \(2 cards\)/i)).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>(/hero hand/i).value).toBe("As Ks");
  expect(screen.getByLabelText<HTMLInputElement>(/villain hand/i).value).toBe("Qd Qc");
});

test("the simulator adopts the server's game type on a fresh browser", async () => {
  // No localStorage cache — another device saved hold'em earlier.
  stubFetch({ "/settings": settingsRoute("holdem") });

  renderApp();

  expect(await screen.findByLabelText(/hero hand \(2 cards\)/i)).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>(/hero hand/i).value).toBe("As Ks");
  expect(localStorage.getItem("gameType")).toBe("holdem");
});

test("a hold'em run shows the showdown breakdown without a save button", async () => {
  localStorage.setItem("gameType", "holdem");

  renderApp();
  // Locked full board: hero's king kicker wins every runout.
  setInput(/hero hand/i, "As Kd");
  setInput(/villain hand/i, "Ah Qc");
  setInput(/board/i, "Ac 9d 7c 5s 2h");
  setInput(/simulations/i, "50");
  runSimulation();

  expect(await screen.findByText("100.000%", undefined, { timeout: 5000 })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Showdown", level: 3 })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Scoop", level: 3 })).toBeNull();
  expect(screen.queryByRole("button", { name: /save result/i })).toBeNull();
});

test("hold'em mode rejects a hand without exactly 2 cards", () => {
  localStorage.setItem("gameType", "holdem");

  renderApp();
  setInput(/hero hand/i, "As Kd Qh");
  runSimulation();
  expect(screen.getByText("Hero hand must have exactly 2 cards.")).toBeTruthy();
});
