/**
 * Typed wrappers for the backend routes, one per endpoint. See
 * containers/simulationAPI/src/backend/results.ts for the route definitions.
 *
 * Every response is validated against the schemas in types.ts, so a contract
 * change on the backend surfaces as an ApiContractError here instead of
 * undefined fields deeper in the UI. createResult also validates its payload
 * before sending, catching client bugs (e.g. unconverted card notation)
 * without a network round trip.
 */

import { z } from "zod";
import { api } from "./client";
import type {
  AuthUser,
  CreateResultInput,
  HealthResponse,
  Settings,
  StoredResult,
} from "./types";
import {
  authUserSchema,
  createResultInputSchema,
  healthResponseSchema,
  listResultsResponseSchema,
  settingsSchema,
  storedResultSchema,
} from "./types";

/** Data didn't match the wire contract — on either side of it. */
export class ApiContractError extends Error {
  constructor(
    what: string,
    readonly issues: z.ZodError,
  ) {
    super(`${what} did not match the API contract: ${z.prettifyError(issues)}`);
    this.name = "ApiContractError";
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiContractError(what, result.error);
  }
  return result.data;
}

export const healthCheck = async (): Promise<HealthResponse> =>
  parse(healthResponseSchema, await api.get("/health"), "health response");

export const createResult = async (
  input: CreateResultInput,
): Promise<StoredResult> => {
  const body = parse(createResultInputSchema, input, "result to save");
  return parse(
    storedResultSchema,
    await api.post("/results", body),
    "saved result",
  );
};

export const listResults = async (opts?: { limit?: number; offset?: number }) =>
  parse(
    listResultsResponseSchema,
    await api.get("/results", { query: opts }),
    "results list",
  );

export const getResult = async (id: number): Promise<StoredResult> =>
  parse(storedResultSchema, await api.get(`/results/${id}`), "result");

export const deleteResult = (id: number) => api.del(`/results/${id}`);

export const fetchSettings = async (): Promise<Settings> =>
  parse(settingsSchema, await api.get("/settings"), "settings response");

export const updateSettings = async (input: Settings): Promise<Settings> => {
  const body = parse(settingsSchema, input, "settings to save");
  return parse(settingsSchema, await api.put("/settings", body), "saved settings");
};

// Gateway route — served from the SPA's own origin, NOT the api.* host.
export const fetchMe = async (): Promise<AuthUser> =>
  parse(authUserSchema, await api.get("/auth/me", { baseUrl: "" }), "auth/me response");
