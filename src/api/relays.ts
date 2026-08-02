import { queryOptions } from "@tanstack/react-query";
import type { RelayApiResponse } from "../shared/relay";

export class RelayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RelayApiError";
  }
}

export const relayKeys = {
  all: ["relays"] as const,
  snapshot: () => [...relayKeys.all, "snapshot"] as const,
};

export const relayQueryOptions = () =>
  queryOptions({
    queryKey: relayKeys.snapshot(),
    queryFn: ({ signal }) => fetchRelays(signal),
    staleTime: 5 * 60 * 1_000,
    gcTime: 30 * 60 * 1_000,
    retry: (failureCount, error) =>
      error instanceof RelayApiError && error.status >= 500 && failureCount < 2,
  });

async function fetchRelays(signal: AbortSignal): Promise<RelayApiResponse> {
  const response = await fetch("/api/relays", {
    signal,
    headers: { accept: "application/json" },
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = readErrorMessage(body) ?? `Relay API returned HTTP ${response.status}`;
    throw new RelayApiError(message, response.status);
  }
  if (!isRelayApiResponse(body)) {
    throw new RelayApiError("Relay API returned an invalid response.", 502);
  }

  return body;
}

function readErrorMessage(value: unknown) {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = Reflect.get(value, "error");
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = Reflect.get(error, "message");
  return typeof message === "string" ? message : null;
}

function isRelayApiResponse(value: unknown): value is RelayApiResponse {
  if (typeof value !== "object" || value === null || !("data" in value) || !("meta" in value)) {
    return false;
  }
  const data = Reflect.get(value, "data");
  const meta = Reflect.get(value, "meta");
  return (
    typeof data === "object" &&
    data !== null &&
    "generatedAt" in data &&
    typeof Reflect.get(data, "generatedAt") === "string" &&
    "locations" in data &&
    Array.isArray(Reflect.get(data, "locations")) &&
    typeof meta === "object" &&
    meta !== null &&
    "cache" in meta
  );
}
