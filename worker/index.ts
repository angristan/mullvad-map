import { Effect } from "effect";
import { Hono } from "hono";
import type {
  LatencyCandidatesResponse,
  RelayApiResponse,
  RelayLocation,
  RelaySnapshot,
} from "../src/shared/relay";
import {
  makeRelayLayer,
  readCacheState,
  refreshSnapshot,
  RelayCache,
  RelayUpstream,
  type CacheState,
} from "./relay-service";

const app = new Hono<{ Bindings: Env }>();
let refreshInFlight: Promise<RelaySnapshot> | undefined;

app.get("/api/health", (context) =>
  context.json({ status: "ok" }, 200, {
    "cache-control": "no-store",
  }),
);

app.get("/api/relays", async (context) => {
  const rateLimitKey = `${context.req.header("cf-connecting-ip") ?? "local"}:relays`;
  const rateLimit = await context.env.API_RATE_LIMITER.limit({ key: rateLimitKey });

  if (!rateLimit.success) {
    return context.json(
      {
        error: {
          code: "rate_limited",
          message: "Too many relay requests. Try again in one minute.",
        },
      } as const,
      429,
      {
        "cache-control": "no-store",
        "retry-after": "60",
      },
    );
  }

  try {
    const state = await runEffect(context.env, readCacheState());
    const { snapshot, cache } = await resolveSnapshot(context.env, context.executionCtx, state);
    const etag = `W/\"${Date.parse(snapshot.generatedAt).toString(36)}\"`;
    const headers = responseHeaders(cache, etag);

    if (context.req.header("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }

    const payload: RelayApiResponse = {
      data: snapshot,
      meta: {
        cache,
        ageSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(snapshot.generatedAt)) / 1_000)),
      },
    };

    return context.json(payload, 200, headers);
  } catch (error) {
    const tag = getErrorTag(error);
    console.error("Relay API request failed", { error: tag });

    return context.json(
      {
        error: {
          code: "upstream_unavailable",
          message: "Relay data is temporarily unavailable.",
        },
      } as const,
      503,
      { "cache-control": "no-store", "retry-after": "30" },
    );
  }
});

app.get("/api/latency-candidates", async (context) => {
  const rateLimitKey = `${context.req.header("cf-connecting-ip") ?? "local"}:latency`;
  const rateLimit = await context.env.API_RATE_LIMITER.limit({ key: rateLimitKey });

  if (!rateLimit.success) {
    return context.json(
      {
        error: {
          code: "rate_limited",
          message: "Too many latency requests. Try again in one minute.",
        },
      } as const,
      429,
      { "cache-control": "no-store", "retry-after": "60" },
    );
  }

  try {
    const state = await runEffect(context.env, readCacheState());
    const { snapshot } = await resolveSnapshot(context.env, context.executionCtx, state);
    const edgeLocation = readEdgeLocation(context.req.raw.cf);
    const payload: LatencyCandidatesResponse = {
      locationKeys: orderLocationsForLatency(snapshot.locations, edgeLocation),
      basis: edgeLocation ? "edge" : "global",
    };

    return context.json(payload, 200, {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
  } catch (error) {
    console.error("Latency candidate request failed", { error: getErrorTag(error) });
    return context.json(
      {
        error: {
          code: "upstream_unavailable",
          message: "Latency candidates are temporarily unavailable.",
        },
      } as const,
      503,
      { "cache-control": "no-store", "retry-after": "30" },
    );
  }
});

app.notFound((context) =>
  context.json(
    { error: { code: "internal_error", message: "API route not found." } },
    404,
    { "cache-control": "no-store" },
  ),
);

function runEffect<A, E>(
  env: Env,
  effect: Effect.Effect<A, E, RelayCache | RelayUpstream>,
) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeRelayLayer(env))));
}

function refresh(env: Env) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = runEffect(env, refreshSnapshot()).finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

async function resolveSnapshot(
  env: Env,
  executionContext: { waitUntil(promise: Promise<unknown>): void },
  state: CacheState,
): Promise<{ snapshot: RelaySnapshot; cache: "hit" | "miss" | "stale" }> {
  if (state.status === "hit") {
    return { snapshot: state.record.snapshot, cache: "hit" };
  }

  if (state.status === "stale") {
    executionContext.waitUntil(
      refresh(env).catch((error: unknown) => {
        console.error("Background relay refresh failed", { error: getErrorTag(error) });
      }),
    );
    return { snapshot: state.record.snapshot, cache: "stale" };
  }

  return { snapshot: await refresh(env), cache: "miss" };
}

function readEdgeLocation(cf: Request["cf"]) {
  const latitude = Number(cf?.latitude);
  const longitude = Number(cf?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function orderLocationsForLatency(
  locations: ReadonlyArray<RelayLocation>,
  origin: { latitude: number; longitude: number } | null,
) {
  const eligible = locations.filter((location) =>
    location.servers.some((server) => server.active && server.type === "wireguard"),
  );

  if (origin) {
    return [...eligible]
      .sort(
        (left, right) =>
          angularDistance(left, origin) - angularDistance(right, origin) ||
          left.key.localeCompare(right.key),
      )
      .map((location) => location.key);
  }

  const remaining = [...eligible].sort(
    (left, right) => right.servers.length - left.servers.length || left.key.localeCompare(right.key),
  );
  const ordered: RelayLocation[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (!candidate) continue;
      const distance =
        ordered.length === 0
          ? candidate.servers.length
          : Math.min(...ordered.map((location) => angularDistance(candidate, location)));
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    if (next) ordered.push(next);
  }

  return ordered.map((location) => location.key);
}

function angularDistance(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const latitudeDelta = rightLatitude - leftLatitude;
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function responseHeaders(cache: "hit" | "miss" | "stale", etag: string) {
  return {
    "cache-control": "public, max-age=60, stale-while-revalidate=300",
    "content-type": "application/json; charset=UTF-8",
    etag,
    "x-content-type-options": "nosniff",
    "x-relay-cache": cache,
  };
}

function getErrorTag(error: unknown) {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tag = Reflect.get(error, "_tag");
    return typeof tag === "string" ? tag : "unknown";
  }
  return "unknown";
}

export default app;
