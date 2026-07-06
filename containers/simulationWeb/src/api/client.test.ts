import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, UnauthorizedError } from "./client";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("api client", () => {
  it("GETs with base URL, query string, and credentials", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { results: [] }));

    const result = await api.get("/results", {
      query: { limit: 5, offset: 0, cursor: undefined },
    });

    expect(result).toEqual({ results: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/results?limit=5&offset=0");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeUndefined();
  });

  it("POSTs a JSON-serialized body with Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 1 }));

    const result = await api.post("/results", { source: "web" });

    expect(result).toEqual({ id: 1 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ source: "web" }));
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
    });
  });

  it("throws ApiError with status and parsed body on 404", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { message: "result not found" }),
    );

    const err = await api.get("/results/999").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(UnauthorizedError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).body).toEqual({ message: "result not found" });
  });

  it("throws UnauthorizedError on 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "unauthorized" }));

    const err = await api.get("/results").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
  });

  it("resolves undefined on 204 without reading a body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(api.del("/results/1")).resolves.toBeUndefined();
  });

  it("wraps network failures in ApiError with status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const err = await api.get("/health").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).body).toBeNull();
  });

  it('uses a relative URL when baseUrl is overridden with ""', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { sub: "u1" }));

    await api.get("/auth/me", { baseUrl: "" });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("/auth/me");
  });
});
