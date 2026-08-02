import { Context, Data, Effect, Layer, Schema } from "effect";
import type { RelayLocation, RelayServer, RelaySnapshot } from "../src/shared/relay";
import {
  CachedRelayRecordSchema,
  CoordinatesResponseSchema,
  RawServersSchema,
  type CachedRelayRecord,
  type RawServer,
} from "./schemas";

const COORDINATES_URL = "https://api.mullvad.net/app/v1/relays";
const SERVERS_URL = "https://api.mullvad.net/www/relays/all/";
const CACHE_KEY = "mullvad:relay-snapshot:v2";
const FRESH_FOR_MS = 15 * 60 * 1_000;
const RETAIN_FOR_SECONDS = 7 * 24 * 60 * 60;

export class CacheReadError extends Data.TaggedError("CacheReadError")<{
  readonly cause: unknown;
}> {}

export class CacheWriteError extends Data.TaggedError("CacheWriteError")<{
  readonly cause: unknown;
}> {}

export class UpstreamError extends Data.TaggedError("UpstreamError")<{
  readonly cause: unknown;
  readonly source: string;
}> {}

export class DecodeError extends Data.TaggedError("DecodeError")<{
  readonly cause: unknown;
  readonly source: string;
}> {}

export class RelayCache extends Context.Service<
  RelayCache,
  {
    readonly get: Effect.Effect<CachedRelayRecord | null, CacheReadError | DecodeError>;
    readonly put: (record: CachedRelayRecord) => Effect.Effect<void, CacheWriteError>;
  }
>()("RelayCache") {}

export class RelayUpstream extends Context.Service<
  RelayUpstream,
  {
    readonly fetchSnapshot: Effect.Effect<RelaySnapshot, UpstreamError | DecodeError>;
  }
>()("RelayUpstream") {}

export type CacheState =
  | { readonly status: "miss" }
  | { readonly status: "hit" | "stale"; readonly record: CachedRelayRecord };

const decodeCachedRecord = Schema.decodeUnknownEffect(CachedRelayRecordSchema);
const decodeCoordinates = Schema.decodeUnknownEffect(CoordinatesResponseSchema);
const decodeServers = Schema.decodeUnknownEffect(RawServersSchema);

const fetchJson = Effect.fn("RelayUpstream.fetchJson")(function* (url: string) {
  const response = yield* Effect.tryPromise({
    try: (signal) => fetch(url, { signal, headers: { accept: "application/json" } }),
    catch: (cause) => new UpstreamError({ cause, source: url }),
  });

  if (!response.ok) {
    return yield* new UpstreamError({
      cause: `Unexpected HTTP ${response.status}`,
      source: url,
    });
  }

  const body = yield* Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: (cause) => new DecodeError({ cause, source: url }),
  });

  return { body, lastModified: response.headers.get("last-modified") } as const;
});

const fetchSnapshot = Effect.fn("RelayUpstream.fetchSnapshot")(function* () {
  const [coordinatesResult, serversResult] = yield* Effect.all(
    [fetchJson(COORDINATES_URL), fetchJson(SERVERS_URL)],
    { concurrency: "unbounded" },
  );

  const coordinates = yield* decodeCoordinates(coordinatesResult.body).pipe(
    Effect.mapError((cause) => new DecodeError({ cause, source: COORDINATES_URL })),
  );
  const rawServers = yield* decodeServers(serversResult.body).pipe(
    Effect.mapError((cause) => new DecodeError({ cause, source: SERVERS_URL })),
  );

  const locations = yield* Effect.try({
    try: () => normalizeLocations(coordinates.locations, rawServers),
    catch: (cause) =>
      cause instanceof DecodeError
        ? cause
        : new DecodeError({ cause, source: "Relay normalization" }),
  });
  const modifiedDates = [coordinatesResult.lastModified, serversResult.lastModified]
    .filter((value): value is string => Boolean(value))
    .map(Date.parse)
    .filter(Number.isFinite);
  const now = Date.now();

  return {
    generatedAt: new Date(now).toISOString(),
    sourceUpdatedAt: new Date(modifiedDates.length > 0 ? Math.max(...modifiedDates) : now).toISOString(),
    locations,
  } satisfies RelaySnapshot;
});

export const makeRelayLayer = (env: Env) =>
  Layer.mergeAll(
    Layer.succeed(RelayCache)({
      get: Effect.tryPromise({
        try: () => env.RELAY_CACHE.get(CACHE_KEY, { type: "json", cacheTtl: 60 }),
        catch: (cause) => new CacheReadError({ cause }),
      }).pipe(
        Effect.flatMap((value) =>
          value === null
            ? Effect.succeed(null)
            : decodeCachedRecord(value).pipe(
                Effect.mapError((cause) => new DecodeError({ cause, source: "KV cache" })),
              ),
        ),
      ),
      put: (record) =>
        Effect.tryPromise({
          try: () =>
            env.RELAY_CACHE.put(CACHE_KEY, JSON.stringify(record), {
              expirationTtl: RETAIN_FOR_SECONDS,
            }),
          catch: (cause) => new CacheWriteError({ cause }),
        }),
    }),
    Layer.succeed(RelayUpstream)({ fetchSnapshot: fetchSnapshot() }),
  );

export const readCacheState = Effect.fn("RelayCache.readState")(function* (now = Date.now()) {
  const cache = yield* RelayCache;
  const record = yield* cache.get.pipe(
    Effect.catch((error) =>
      Effect.logWarning("Relay cache read failed; using upstream", {
        error: error._tag,
      }).pipe(Effect.as(null)),
    ),
  );

  if (record === null) return { status: "miss" } as const;
  return now < record.expiresAt
    ? ({ status: "hit", record } as const)
    : ({ status: "stale", record } as const);
});

export const refreshSnapshot = Effect.fn("RelayCache.refresh")(function* (now = Date.now()) {
  const cache = yield* RelayCache;
  const upstream = yield* RelayUpstream;
  const snapshot = yield* upstream.fetchSnapshot;
  const record = { expiresAt: now + FRESH_FOR_MS, snapshot } satisfies CachedRelayRecord;

  yield* cache.put(record).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Relay cache write failed; returning fresh data", {
        error: error._tag,
      }),
    ),
  );

  return snapshot;
});

function normalizeLocations(
  coordinates: Readonly<Record<string, { readonly latitude: number; readonly longitude: number }>>,
  rawServers: ReadonlyArray<RawServer>,
): ReadonlyArray<RelayLocation> {
  const grouped = new Map<string, RawServer[]>();
  for (const server of rawServers) {
    const key = `${server.country_code}-${server.city_code}`;
    const group = grouped.get(key) ?? [];
    group.push(server);
    grouped.set(key, group);
  }

  return [...grouped.entries()]
    .map(([key, servers]) => {
      const coordinate = coordinates[key];
      const first = servers[0];
      if (!coordinate || !first) {
        throw new DecodeError({ cause: `Coordinates missing for ${key}`, source: COORDINATES_URL });
      }

      return {
        key,
        countryCode: first.country_code,
        country: first.country_name,
        cityCode: first.city_code,
        city: first.city_name,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        servers: servers.map(normalizeServer).sort((a, b) => a.hostname.localeCompare(b.hostname)),
      } satisfies RelayLocation;
    })
    .sort((a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city));
}

function normalizeServer(server: RawServer): RelayServer {
  return {
    hostname: server.hostname,
    active: server.active,
    owned: server.owned,
    provider: server.provider,
    ipv4: server.ipv4_addr_in,
    ipv6: server.ipv6_addr_in,
    speedGbps: server.network_port_speed,
    stboot: server.stboot,
    type: server.type,
    daita: server.daita ?? false,
    messages: server.status_messages.map(normalizeMessage),
  };
}

function normalizeMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = Reflect.get(value, "message");
    if (typeof message === "string") return message;
  }
  return "Service notice";
}
