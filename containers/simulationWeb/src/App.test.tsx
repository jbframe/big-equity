// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import App from "./App";

afterEach(cleanup);

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

test("a locked full board shows 100% hero equity", async () => {
  render(<App />);
  setInput(/hero hand/i, "As Ts 3h 4h 5h");
  setInput(/villain hand/i, "Ah Ad 9c 9d 8h");
  setInput(/board/i, "Ks Qs Js 2d 7c");
  setInput(/simulations/i, "50");
  runSimulation();

  expect(await screen.findByText("100.000%", undefined, { timeout: 5000 })).toBeTruthy();
});
