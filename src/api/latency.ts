import type { LatencyCandidatesResponse } from "../shared/relay";

export async function fetchLatencyCandidates(signal: AbortSignal) {
  const response = await fetch("/api/latency-candidates", {
    signal,
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isLatencyCandidatesResponse(body)) {
    throw new Error("Could not select nearby latency candidates.");
  }

  return body;
}

function isLatencyCandidatesResponse(value: unknown): value is LatencyCandidatesResponse {
  if (typeof value !== "object" || value === null) return false;
  const locationKeys = Reflect.get(value, "locationKeys");
  const basis = Reflect.get(value, "basis");
  return (
    Array.isArray(locationKeys) &&
    locationKeys.every((key) => typeof key === "string") &&
    (basis === "edge" || basis === "global")
  );
}
