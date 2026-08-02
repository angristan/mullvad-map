import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayApiResponse } from "../src/shared/relay";

const CACHE_KEY = "mullvad:relay-snapshot:v2";
const COORDINATES_URL = "https://api.mullvad.net/app/v1/relays";
const SERVERS_URL = "https://api.mullvad.net/www/relays/all/";

beforeEach(async () => {
  await env.RELAY_CACHE.delete(CACHE_KEY);
});

describe("relay API", () => {
  it("decodes Mullvad data and reuses the KV snapshot", async () => {
    const upstreamFetch = mockMullvadUpstream();
    const ip = `test-${crypto.randomUUID()}`;

    const first = await exports.default.fetch("http://example.com/api/relays", {
      headers: { "cf-connecting-ip": ip },
    });
    const firstPayload = (await first.json()) as RelayApiResponse;

    expect(first.status).toBe(200);
    expect(first.headers.get("x-relay-cache")).toBe("miss");
    expect(firstPayload.meta.cache).toBe("miss");
    expect(firstPayload.data.locations).toHaveLength(1);
    expect(firstPayload.data.locations[0]?.servers).toEqual([
      expect.objectContaining({
        hostname: "se-got-wg-001",
        daita: false,
        messages: ["Scheduled maintenance"],
      }),
    ]);
    expect(upstreamFetch).toHaveBeenCalledTimes(2);

    const second = await exports.default.fetch("http://example.com/api/relays", {
      headers: { "cf-connecting-ip": ip },
    });
    expect(second.status).toBe(200);
    expect(second.headers.get("x-relay-cache")).toBe("hit");
    expect(upstreamFetch).toHaveBeenCalledTimes(2);

    const conditional = await exports.default.fetch("http://example.com/api/relays", {
      headers: {
        "cf-connecting-ip": ip,
        "if-none-match": first.headers.get("etag") ?? "",
      },
    });
    expect(conditional.status).toBe(304);

    const candidates = await exports.default.fetch(
      "http://example.com/api/latency-candidates",
      { headers: { "cf-connecting-ip": ip } },
    );
    expect(candidates.status).toBe(200);
    expect(candidates.headers.get("cache-control")).toBe("no-store");
    await expect(candidates.json()).resolves.toEqual({
      locationKeys: ["se-got"],
      basis: "global",
    });
  });

  it("refreshes stale snapshots within each request context", async () => {
    const upstreamFetch = mockMullvadUpstream();
    const seedResponse = await exports.default.fetch("http://example.com/api/relays", {
      headers: { "cf-connecting-ip": `seed-${crypto.randomUUID()}` },
    });
    const seedPayload = (await seedResponse.json()) as RelayApiResponse;
    await env.RELAY_CACHE.put(
      CACHE_KEY,
      JSON.stringify({
        expiresAt: Date.now() - 1,
        snapshot: seedPayload.data,
      }),
    );
    upstreamFetch.mockRestore();
    let releaseUpstream!: () => void;
    const upstreamGate = new Promise<void>((resolve) => {
      releaseUpstream = () => resolve();
    });
    const concurrentFetch = mockMullvadUpstream(upstreamGate);
    const responsesPromise = Promise.all(
      ["first", "second"].map((request) =>
        exports.default.fetch("http://example.com/api/relays", {
          headers: { "cf-connecting-ip": `${request}-${crypto.randomUUID()}` },
        }),
      ),
    );

    await vi.waitFor(() => expect(concurrentFetch).toHaveBeenCalledTimes(4));
    releaseUpstream();
    const responses = await responsesPromise;

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.map((response) => response.headers.get("x-relay-cache"))).toEqual([
      "stale",
      "stale",
    ]);
    expect(concurrentFetch).toHaveBeenCalledTimes(4);
  });

  it("exposes an uncached health route", async () => {
    const response = await exports.default.fetch("http://example.com/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

function mockMullvadUpstream(gate?: Promise<void>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const headers = { "content-type": "application/json", "last-modified": "Wed, 30 Jul 2026 04:44:02 GMT" };
    if (gate) await gate;

    if (request.url === COORDINATES_URL) {
      return Response.json(
        {
          locations: {
            "se-got": {
              country: "Sweden",
              city: "Gothenburg",
              latitude: 57.70887,
              longitude: 11.97456,
            },
          },
        },
        { headers },
      );
    }

    if (request.url === SERVERS_URL) {
      return Response.json(
        [
          {
            hostname: "se-got-wg-001",
            country_code: "se",
            country_name: "Sweden",
            city_code: "got",
            city_name: "Gothenburg",
            active: true,
            owned: true,
            provider: "31173",
            ipv4_addr_in: "185.65.135.1",
            ipv6_addr_in: null,
            network_port_speed: 10,
            stboot: true,
            type: "wireguard",
            status_messages: [{ message: "Scheduled maintenance" }],
          },
        ],
        { headers },
      );
    }

    throw new Error(`Unexpected outbound request: ${request.url}`);
  });
}
