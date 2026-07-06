// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setInput(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function runSimulation() {
  fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
}

test("renders the form with the example matchup prefilled", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /poker hi-lo equity/i })).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>(/hero hand/i).value).toBe("Ad 5d 4s Ks Tc");
  expect(screen.getByLabelText<HTMLInputElement>(/villain hand/i).value).toBe("Ah Ac Kd 4c 2h");
  expect(screen.getByLabelText<HTMLInputElement>(/board/i).value).toBe("3s 9d Js");
});

test("rejects a hero hand without exactly 5 cards", () => {
  render(<App />);
  setInput(/hero hand/i, "Ad 5d 4s Ks");
  runSimulation();
  expect(screen.getByText("Hero hand must have exactly 5 cards.")).toBeTruthy();
});

test("rejects an invalid card", () => {
  render(<App />);
  setInput(/hero hand/i, "Ad 5d 4s Ks Xz");
  runSimulation();
  expect(screen.getByText(/invalid card rank/i)).toBeTruthy();
});

test("rejects duplicate cards across hands and board", () => {
  render(<App />);
  // "10c" in the villain hand collides with hero's "Tc" once normalized.
  setInput(/villain hand/i, "Ah Ac Kd 4c 10c");
  runSimulation();
  expect(screen.getByText("Duplicate card in play.")).toBeTruthy();
});

test("runs a simulation and shows the results breakdown", async () => {
  render(<App />);
  setInput(/simulations/i, "200");
  runSimulation();

  expect(await screen.findByText(/hero equity/i, undefined, { timeout: 5000 })).toBeTruthy();
  expect(screen.getByText(/200 simulations/i)).toBeTruthy();
  expect(screen.getByRole("heading", { name: /high hand/i })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Scoop", level: 3 })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "When nobody scoops", level: 3 })).toBeTruthy();
});

test("saves a result to the backend in API card notation", async () => {
  // Echo the payload back with id/createdAt, like the backend's insert does.
  const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          ...JSON.parse(init.body as string),
          id: 1,
          createdAt: "2026-07-06 08:00:00+00",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  render(<App />);
  setInput(/simulations/i, "50");
  runSimulation();
  await screen.findByText(/hero equity/i, undefined, { timeout: 5000 });

  fireEvent.click(screen.getByRole("button", { name: /save result/i }));

  expect(await screen.findByRole("button", { name: /saved/i })).toBeTruthy();
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url.endsWith("/results")).toBe(true);
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

  render(<App />);
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
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("the past results tab lists saved results in display notation", async () => {
  const fetchMock = stubResultsList([storedResult]);

  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));

  expect(await screen.findByText("Ad 5d 4s Ks Tc")).toBeTruthy();
  expect(screen.getByText("Ah Ac Kd 4c 2h")).toBeTruthy();
  expect(screen.getByText("55.125%")).toBeTruthy();
  const [url] = fetchMock.mock.calls[0] as [string];
  expect(url.endsWith("/results")).toBe(true);

  // Expanding a row shows the full breakdown.
  fireEvent.click(screen.getByRole("button", { name: /ad 5d 4s ks tc/i }));
  expect(screen.getByText(/hero equity/i)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Scoop", level: 3 })).toBeTruthy();
});

test("the past results tab shows an empty state", async () => {
  stubResultsList([]);

  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));

  expect(await screen.findByText(/no saved results yet/i)).toBeTruthy();
});

test("the past results tab surfaces load failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

  render(<App />);
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));

  expect(await screen.findByText(/network error/i)).toBeTruthy();
});

test("the simulator form keeps its values across tab switches", async () => {
  stubResultsList([]);

  render(<App />);
  setInput(/hero hand/i, "As Ks Qs Js 9s");
  fireEvent.click(screen.getByRole("tab", { name: /past results/i }));
  await screen.findByText(/no saved results yet/i);
  fireEvent.click(screen.getByRole("tab", { name: /simulator/i }));

  expect(screen.getByLabelText<HTMLInputElement>(/hero hand/i).value).toBe("As Ks Qs Js 9s");
});

test("a locked full board shows 100% hero equity", async () => {
  render(<App />);
  setInput(/hero hand/i, "As Ts 3h 4h 5h");
  setInput(/villain hand/i, "Ah Ad 9c 9d 8h");
  setInput(/board/i, "Ks Qs Js 2d 7c");
  setInput(/simulations/i, "50");
  runSimulation();

  expect(await screen.findByText("100.000%", undefined, { timeout: 5000 })).toBeTruthy();
});
