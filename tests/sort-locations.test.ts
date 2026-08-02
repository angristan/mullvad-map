import { describe, expect, it } from "vitest";
import type { LatencyResult } from "../src/lib/latency";
import { sortLocations } from "../src/lib/sort-locations";
import type { FilteredLocation, RelayServer } from "../src/shared/relay";

const server = (hostname: string, speedGbps: number): RelayServer => ({
  hostname,
  active: true,
  owned: true,
  provider: "provider",
  ipv4: "192.0.2.1",
  ipv6: null,
  speedGbps,
  stboot: true,
  type: "wireguard",
  daita: false,
  messages: [],
});

const location = (
  key: string,
  city: string,
  servers: RelayServer[],
): FilteredLocation => ({
  key,
  countryCode: key.slice(0, 2),
  country: "Country",
  cityCode: key.slice(3),
  city,
  latitude: 0,
  longitude: 0,
  servers,
});

const latency = (locationKey: string, estimatedMs: number): LatencyResult => ({
  locationKey,
  serverHostname: "relay",
  estimatedMs,
  rawMedianMs: estimatedMs * 4,
  samples: [estimatedMs * 4],
});

describe("sortLocations", () => {
  const locations = [
    location("fr-par", "Paris", [server("par-1", 20)]),
    location("nl-ams", "Amsterdam", [server("ams-1", 10), server("ams-2", 10)]),
    location("gb-lon", "London", [server("lon-1", 40)]),
  ];
  const latencies = new Map([
    ["fr-par", latency("fr-par", 5)],
    ["gb-lon", latency("gb-lon", 15)],
  ]);

  it("sorts by name, relay count, listed capacity, and measured latency", () => {
    expect(sortLocations(locations, "name", "asc", latencies).map((item) => item.key)).toEqual([
      "nl-ams",
      "gb-lon",
      "fr-par",
    ]);
    expect(sortLocations(locations, "relays", "desc", latencies).map((item) => item.key)).toEqual([
      "nl-ams",
      "gb-lon",
      "fr-par",
    ]);
    expect(sortLocations(locations, "capacity", "desc", latencies).map((item) => item.key)).toEqual([
      "gb-lon",
      "nl-ams",
      "fr-par",
    ]);
    expect(sortLocations(locations, "latency", "asc", latencies).map((item) => item.key)).toEqual([
      "fr-par",
      "gb-lon",
      "nl-ams",
    ]);
  });
});
