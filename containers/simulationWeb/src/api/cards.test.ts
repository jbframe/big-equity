import { describe, expect, it } from "vitest";
import { toApiCard, toApiCards } from "./cards";

describe("toApiCard", () => {
  it("lowercases ranks and keeps suits", () => {
    expect(toApiCard("Ad")).toBe("ad");
    expect(toApiCard("Ks")).toBe("ks");
    expect(toApiCard("2h")).toBe("2h");
  });

  it("writes tens as 10, whatever the input form", () => {
    expect(toApiCard("Tc")).toBe("10c");
    expect(toApiCard("tc")).toBe("10c");
    expect(toApiCard("10c")).toBe("10c");
  });

  it("rejects invalid cards", () => {
    expect(() => toApiCard("Xz")).toThrow(/invalid card rank/i);
  });

  it("converts whole hands", () => {
    expect(toApiCards(["Ad", "Tc", "9s"])).toEqual(["ad", "10c", "9s"]);
  });
});
