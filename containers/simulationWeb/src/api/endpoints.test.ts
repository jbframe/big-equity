import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiContractError, createResult, healthCheck } from "./endpoints";
import type { CreateResultInput } from "./types";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const validInput: CreateResultInput = {
  source: "web",
  heroHand: ["ad", "5d", "4s", "ks", "10c"],
  villainHand: ["ah", "ac", "kd", "4c", "2h"],
  board: ["3s", "9d", "js"],
  simulations: 100,
  heroEquity: 50.5,
  high: { heroWins: 60, villainWins: 35, splits: 5 },
  low: { heroWins: 10, villainWins: 20, splits: 5, noLow: 65 },
  scoop: { hero: 40, villain: 40, none: 20 },
  noScoop: {
    high: { heroWins: 10, villainWins: 5, splits: 5 },
    low: { heroWins: 2, villainWins: 8, splits: 3, noLow: 7 },
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("endpoint validation", () => {
  it("returns a stored result when the response matches the contract", async () => {
    const row = { ...validInput, id: 7, createdAt: "2026-07-06 08:00:00+00" };
    fetchMock.mockResolvedValue(jsonResponse(201, row));

    await expect(createResult(validInput)).resolves.toEqual(row);
  });

  it("rejects an invalid payload before any network call", async () => {
    const badCards = { ...validInput, heroHand: ["Ad", "5d", "4s", "Ks", "Tc"] };

    await expect(createResult(badCards)).rejects.toThrow(ApiContractError);
    await expect(createResult(badCards)).rejects.toThrow(/result to save/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a response that drifted from the contract", async () => {
    // Fresh Response per call — a body is only readable once.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(201, { id: 7 })));

    await expect(createResult(validInput)).rejects.toThrow(ApiContractError);
    await expect(createResult(validInput)).rejects.toThrow(/saved result/);
  });

  it("validates simple responses too", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: "degraded" }));

    await expect(healthCheck()).rejects.toThrow(ApiContractError);
  });
});
